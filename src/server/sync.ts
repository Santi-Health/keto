/**
 * Background sync, run by the Supabase Edge Function "health-sync" every 4 hours (and once right after linking).
 * For each linked user: trade the stored Google refresh token for an access token, then pull the same data
 * the app's Import buttons pull (workouts, steps/burn/resting HR/HRV/sleep, weigh-ins, Lingo glucose) and,
 * once a week, save the Drive backup. It reuses the app's own import code, so results match a manual import.
 *
 * The server's clock is UTC, so anything grouped by "local day" is shifted into the user's time zone first.
 */
import { catchUpDays, mergeActivity, weightReadings, type ActivityDay } from '../lib/activity'
import { mergeIntoDays, parseGlucosePoint, type CgmDay } from '../lib/cgm'
import { backupDue, backupToDrive } from '../lib/driveBackup'
import type { Exercise } from '../lib/exercise'
import type { ExportBundle } from '../lib/exportData'
import type { Food, LogEntry } from '../lib/foods'
import { duplicateExercises, fetchActivity, heartRateCalories, learnTypes, listExercises, listGlucose, mergeImported, toAppExercise } from '../lib/googleHealth'
import type { ReadingRow } from '../lib/readings'
import type { SavedMeal } from '../lib/savedMeals'
import { computeTargets } from '../lib/targets'
import { dayIn, midnightIn } from '../lib/time'
import { DEFAULT_PROFILE, type Profile } from '../lib/types'

export interface Env {
  supabaseUrl: string
  serviceKey: string
  anonKey: string
  googleClientId: string
  googleClientSecret: string
}

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
/** Google Health rejects tokens that also carry other APIs' scopes, so health calls get a health-only token. */
export const HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
]

/** The granted scopes split into what the health token and the Drive token may carry. */
export function splitScopes(granted: string): { health: string; drive: string | null } {
  const has = new Set(granted.split(/\s+/).filter(Boolean))
  return { health: HEALTH_SCOPES.filter((x) => has.has(x)).join(' '), drive: has.has(DRIVE_SCOPE) ? DRIVE_SCOPE : null }
}

// --- Database (PostgREST with the service key, which bypasses row-level security) ---------

function db(env: Env) {
  // New-style secret keys (sb_secret_…) go in the apikey header only; legacy JWT keys also as a bearer token.
  const headers: Record<string, string> = env.serviceKey.startsWith('sb_')
    ? { apikey: env.serviceKey, 'Content-Type': 'application/json' }
    : { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, 'Content-Type': 'application/json' }
  const base = `${env.supabaseUrl}/rest/v1`
  return {
    async select<T>(table: string, query: string): Promise<T[]> {
      const res = await fetch(`${base}/${table}?${query}`, { headers })
      if (!res.ok) throw new Error(`read ${table}: ${res.status} ${await res.text()}`)
      return res.json()
    },
    async upsert(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<void> {
      if (!rows.length) return
      const res = await fetch(`${base}/${table}?on_conflict=${onConflict}`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      })
      if (!res.ok) throw new Error(`write ${table}: ${res.status} ${await res.text()}`)
    },
    async remove(table: string, query: string): Promise<void> {
      const res = await fetch(`${base}/${table}?${query}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error(`delete ${table}: ${res.status} ${await res.text()}`)
    },
  }
}

/** Rows as the app stores them, minus updated_at (the database sets it), plus the owner. */
const forUser = (userId: string, rows: object[]) =>
  rows.map((r) => {
    const { updated_at: _u, ...rest } = r as Record<string, unknown>
    void _u
    return { ...rest, user_id: userId }
  })

// --- Time zones ---------------------------------------------------------------------------

export { tzOffsetMs } from '../lib/time'

/** The user's local date, computed on a UTC server. */
export const localDateIn = (tz: string, t = Date.now()) => dayIn(tz, t)

// --- Google ---------------------------------------------------------------------------------

export class RelinkNeeded extends Error {}

export async function exchangeCode(env: Env, code: string): Promise<{ refreshToken: string; accessToken: string; scopes: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.googleClientId, client_secret: env.googleClientSecret, redirect_uri: 'postmessage', grant_type: 'authorization_code' }),
  })
  const j = (await res.json()) as { refresh_token?: string; access_token?: string; scope?: string; error?: string; error_description?: string }
  if (!res.ok || !j.access_token) throw new Error(`Google sign-in failed: ${j.error_description ?? j.error ?? res.status}`)
  if (!j.refresh_token) throw new Error('Google did not grant background access. Unlink in your Google account settings, then link again.')
  return { refreshToken: j.refresh_token, accessToken: j.access_token, scopes: j.scope ?? '' }
}

/** A fresh access token, narrowed to `scope` (a subset of what was granted). */
async function accessTokenFor(env: Env, refreshToken: string, scope: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: env.googleClientId, client_secret: env.googleClientSecret, grant_type: 'refresh_token', scope }),
  })
  const j = (await res.json()) as { access_token?: string; error?: string; error_description?: string }
  // Testing-mode Google apps expire background access after 7 days: that shows up as invalid_grant.
  if (j.error === 'invalid_grant') throw new RelinkNeeded('Google background access expired (it lasts about a week). Re-link in the app.')
  if (!res.ok || !j.access_token) throw new Error(`Google token refresh failed: ${j.error_description ?? j.error ?? res.status}`)
  return j.access_token
}

// --- One user ------------------------------------------------------------------------------

interface SyncStatus {
  user_id: string
  time_zone: string
}

/** Health-only and (if granted) Drive-only access tokens from the stored refresh token. */
async function tokensFor(env: Env, refreshToken: string, granted: string): Promise<{ health: string; drive: string | null }> {
  const s = splitScopes(granted)
  if (!s.health) throw new RelinkNeeded('Google health access is missing. Re-link and allow the health data.')
  return { health: await accessTokenFor(env, refreshToken, s.health), drive: s.drive ? await accessTokenFor(env, refreshToken, s.drive) : null }
}

export async function syncUser(env: Env, userId: string, tokens: { health: string; drive: string | null }, tz: string): Promise<string> {
  const token = tokens.health
  const d = db(env)
  const today = localDateIn(tz)
  const notes: string[] = []
  const profileRow = (await d.select<{ data: Profile; updated_at: string }>('profiles', `user_id=eq.${userId}&select=data,updated_at`))[0]
  const profile: Profile = { ...DEFAULT_PROFILE, ...profileRow?.data }
  const targets = computeTargets(profile)
  const since = (days: number) => {
    const t = new Date(`${today}T12:00:00Z`)
    t.setUTCDate(t.getUTCDate() - days)
    return t.toISOString().slice(0, 10)
  }

  // Workouts: everything since the last Fitbit one here (at least 3 days), then heart-rate calories for hand-logged ones.
  const exercises = await d.select<Exercise>('exercises', `user_id=eq.${userId}&deleted_at=is.null&started_at=gte.${since(120)}T00:00:00Z`)
  const lastWorkout = exercises.filter((e) => e.source === 'fitbit').map((e) => e.started_at.slice(0, 10)).sort().pop() ?? null
  const exFrom = since(catchUpDays(lastWorkout, today, { min: 3, first: 14 }) - 1)
  const points = await listExercises(token, exFrom, today)
  const mapped = points
    .map((p) => toAppExercise(p, profile.weightKg, targets.bmr, learnTypes(exercises)))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map((x) => ({ ...x, meta: { ...x.meta, tz } }))
  const recent = exercises.filter((e) => e.started_at >= `${exFrom}T00:00:00`)
  const { added, updated, matched } = mergeImported(mapped, recent)
  const touched = new Set([...added, ...updated, ...matched].map((e) => e.id))
  const hrFixed: Exercise[] = []
  for (const e of recent.filter((x) => x.source === 'manual' && x.meta.caloriesEstimated && !touched.has(x.id))) {
    const r = await heartRateCalories(token, new Date(e.started_at), e.duration_min, { age: targets.age, sex: profile.sex, bmrPerDay: targets.bmr, weightKg: profile.weightKg }).catch(() => null)
    if (r) hrFixed.push({ ...e, calories: r.kcal, meta: { ...e.meta, caloriesEstimated: false, caloriesSource: 'heart-rate', avgHr: r.avgHr, hrSamples: r.samples } })
  }
  // Copies made when the phone imported the same session at the same time.
  const dupes = new Set(duplicateExercises(exercises))
  const removed = exercises.filter((e) => dupes.has(e.id)).map((e) => ({ ...e, deleted_at: new Date().toISOString() }))
  await d.upsert('exercises', forUser(userId, [...added, ...updated, ...matched, ...hrFixed, ...removed]), 'id')
  notes.push(`${added.length} new workouts`)

  // Steps, burn, resting HR, HRV, sleep and weigh-ins since the last day here (at least a week).
  const activityRows = await d.select<ActivityDay>('daily_activity', `user_id=eq.${userId}&deleted_at=is.null`)
  const activity = Object.fromEntries(activityRows.map((a) => [a.id, a]))
  const lastDay = activityRows.filter((a) => a.steps != null).map((a) => a.day).sort().pop() ?? null
  const act = await fetchActivity(token, since(catchUpDays(lastDay, today, { min: 7, first: 30 }) - 1), today)
  const days = mergeActivity(act, activity)
  await d.upsert('daily_activity', forUser(userId, days), 'user_id,id')
  const weights = await d.select<ReadingRow>('readings', `user_id=eq.${userId}&kind=eq.weight`)
  const weighIns = await weightReadings(act, weights, tz)
  await d.upsert('readings', forUser(userId, weighIns), 'id')
  notes.push(`${days.length} activity days`)
  if (act.skipped.length) notes.push(`not allowed: ${act.skipped.join(', ')}`)

  // Lingo glucose since the last CGM day here, grouped by the user's local day.
  const cgmRows = await d.select<CgmDay>('cgm_days', `user_id=eq.${userId}&deleted_at=is.null&day=gte.${since(120)}`)
  const cgm = Object.fromEntries(cgmRows.map((c) => [c.id, c]))
  const lastCgm = cgmRows.map((c) => c.day).sort().pop() ?? null
  const from = midnightIn(tz, since(catchUpDays(lastCgm, today, { min: 3, first: 14 }) - 1))
  const raw = await listGlucose(token, new Date(from), new Date())
  const readings = raw.map(parseGlucosePoint).filter((r): r is NonNullable<typeof r> => !!r)
  // Filed under the user's local days (the server's own clock is UTC).
  const cgmDays = mergeIntoDays(readings, cgm, tz)
  await d.upsert('cgm_days', forUser(userId, cgmDays), 'user_id,id')
  notes.push(`${readings.length} glucose readings`)

  // Weekly Drive backup, when Drive was allowed at linking.
  if (tokens.drive && backupDue(profile.lastBackupAt)) {
    const all = async <T,>(table: string) => d.select<T>(table, `user_id=eq.${userId}&deleted_at=is.null`)
    const bundle: ExportBundle = {
      exportedAt: new Date().toISOString(),
      profile,
      foods: await all<Food>('foods'),
      foodLogs: await all<LogEntry>('food_logs'),
      savedMeals: await all<SavedMeal>('saved_meals'),
      exercises: await all<Exercise>('exercises'),
      readings: await all<ReadingRow>('readings'),
      activity: await all<ActivityDay>('daily_activity'),
      cgmDays: await all<CgmDay>('cgm_days'),
    }
    const r = await backupToDrive(tokens.drive, JSON.stringify(bundle), `keto-tracker-${today}.json`, profile.backupFolderId)
    const now = new Date().toISOString()
    await d.upsert('profiles', [{ user_id: userId, data: { ...profileRow?.data, lastBackupAt: now, backupFolderId: r.folderId, updatedAt: now }, updated_at: now }], 'user_id')
    notes.push(`backed up ${r.fileName}`)
  }
  return notes.join(', ')
}

/**
 * Syncs every linked user; one user's failure doesn't stop the others. Users synced within the last
 * `minGapMs` are skipped, so calling the (public) run address repeatedly can't hammer Google.
 */
export async function runAll(env: Env, minGapMs = 50 * 60_000): Promise<{ user: string; result: string }[]> {
  const d = db(env)
  const tokens = await d.select<{ user_id: string; refresh_token: string; scopes: string }>('google_tokens', 'select=user_id,refresh_token,scopes')
  const statuses = await d.select<SyncStatus & { last_sync_at: string | null }>('sync_status', 'select=user_id,time_zone,last_sync_at')
  const out: { user: string; result: string }[] = []
  for (const t of tokens) {
    const st = statuses.find((s) => s.user_id === t.user_id)
    if (st?.last_sync_at && Date.now() - Date.parse(st.last_sync_at) < minGapMs) {
      out.push({ user: t.user_id, result: 'skipped: synced recently' })
      continue
    }
    const tz = st?.time_zone ?? 'America/Los_Angeles'
    const now = new Date().toISOString()
    try {
      const result = await syncUser(env, t.user_id, await tokensFor(env, t.refresh_token, t.scopes), tz)
      await d.upsert('sync_status', [{ user_id: t.user_id, last_sync_at: now, last_result: result, last_error: null, needs_relink: false, updated_at: now }], 'user_id')
      out.push({ user: t.user_id, result })
    } catch (e) {
      const relink = e instanceof RelinkNeeded
      await d.upsert('sync_status', [{ user_id: t.user_id, last_error: (e as Error).message, needs_relink: relink, updated_at: now }], 'user_id')
      if (relink) await d.remove('google_tokens', `user_id=eq.${t.user_id}`)
      out.push({ user: t.user_id, result: `error: ${(e as Error).message}` })
    }
  }
  return out
}

/** Links a user: checks their app sign-in, trades Google's one-time code for background access, and syncs right away. */
export async function link(env: Env, appJwt: string, code: string, tz: string): Promise<string> {
  const who = await fetch(`${env.supabaseUrl}/auth/v1/user`, { headers: { apikey: env.anonKey, Authorization: `Bearer ${appJwt}` } })
  if (!who.ok) throw new Error('Not signed in to the app.')
  const userId = ((await who.json()) as { id: string }).id
  const g = await exchangeCode(env, code)
  const d = db(env)
  const now = new Date().toISOString()
  await d.upsert('google_tokens', [{ user_id: userId, refresh_token: g.refreshToken, scopes: g.scopes, linked_at: now }], 'user_id')
  await d.upsert('sync_status', [{ user_id: userId, linked_at: now, time_zone: tz, needs_relink: false, last_error: null, updated_at: now }], 'user_id')
  try {
    const result = await syncUser(env, userId, await tokensFor(env, g.refreshToken, g.scopes), tz)
    await d.upsert('sync_status', [{ user_id: userId, last_sync_at: new Date().toISOString(), last_result: result, updated_at: new Date().toISOString() }], 'user_id')
    return result
  } catch (e) {
    await d.upsert('sync_status', [{ user_id: userId, last_error: (e as Error).message, updated_at: new Date().toISOString() }], 'user_id')
    throw e
  }
}

/**
 * Syncs only the signed-in user, right now (the app calls this when it opens). Skips when a sync ran in the
 * last `minGapMs`, so opening the app repeatedly doesn't hit Google each time.
 */
export async function syncMe(env: Env, appJwt: string, tz?: string, minGapMs = 10 * 60_000): Promise<{ ran: boolean; result: string }> {
  const who = await fetch(`${env.supabaseUrl}/auth/v1/user`, { headers: { apikey: env.anonKey, Authorization: `Bearer ${appJwt}` } })
  if (!who.ok) throw new Error('Not signed in to the app.')
  const userId = ((await who.json()) as { id: string }).id
  const d = db(env)
  const token = (await d.select<{ refresh_token: string; scopes: string }>('google_tokens', `user_id=eq.${userId}&select=refresh_token,scopes`))[0]
  if (!token) return { ran: false, result: 'not linked' }
  const st = (await d.select<SyncStatus & { last_sync_at: string | null }>('sync_status', `user_id=eq.${userId}&select=user_id,time_zone,last_sync_at`))[0]
  // Follow the phone: traveling moves the zone the server files new data under.
  if (tz && st && tz !== st.time_zone) {
    await d.upsert('sync_status', [{ user_id: userId, time_zone: tz, updated_at: new Date().toISOString() }], 'user_id')
    st.time_zone = tz
  }
  if (st?.last_sync_at && Date.now() - Date.parse(st.last_sync_at) < minGapMs) return { ran: false, result: 'synced recently' }
  const now = new Date().toISOString()
  try {
    const result = await syncUser(env, userId, await tokensFor(env, token.refresh_token, token.scopes), st?.time_zone ?? 'America/Los_Angeles')
    await d.upsert('sync_status', [{ user_id: userId, last_sync_at: now, last_result: result, last_error: null, needs_relink: false, updated_at: now }], 'user_id')
    return { ran: true, result }
  } catch (e) {
    const relink = e instanceof RelinkNeeded
    await d.upsert('sync_status', [{ user_id: userId, last_error: (e as Error).message, needs_relink: relink, updated_at: now }], 'user_id')
    if (relink) await d.remove('google_tokens', `user_id=eq.${userId}`)
    throw e
  }
}

/** Stops background sync for the signed-in user and forgets their Google access. */
export async function unlink(env: Env, appJwt: string): Promise<void> {
  const who = await fetch(`${env.supabaseUrl}/auth/v1/user`, { headers: { apikey: env.anonKey, Authorization: `Bearer ${appJwt}` } })
  if (!who.ok) throw new Error('Not signed in to the app.')
  const userId = ((await who.json()) as { id: string }).id
  const d = db(env)
  const tokens = await d.select<{ refresh_token: string }>('google_tokens', `user_id=eq.${userId}&select=refresh_token`)
  if (tokens[0]) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens[0].refresh_token)}`, { method: 'POST' }).catch(() => null)
  await d.remove('google_tokens', `user_id=eq.${userId}`)
  await d.upsert('sync_status', [{ user_id: userId, linked_at: null, needs_relink: false, last_error: null, updated_at: new Date().toISOString() }], 'user_id')
}
