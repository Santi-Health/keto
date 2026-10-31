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
import { fetchActivity, heartRateCalories, learnTypes, listExercises, listGlucose, mergeImported, toAppExercise } from '../lib/googleHealth'
import type { ReadingRow } from '../lib/readings'
import type { SavedMeal } from '../lib/savedMeals'
import { computeTargets, localDate } from '../lib/targets'
import { DEFAULT_PROFILE, type Profile } from '../lib/types'

export interface Env {
  supabaseUrl: string
  serviceKey: string
  anonKey: string
  googleClientId: string
  googleClientSecret: string
}

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

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

/** Milliseconds to add to a UTC instant to get the wall-clock time in `tz` (DST-aware). */
export function tzOffsetMs(tz: string, t: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return asUtc - Math.floor(t / 1000) * 1000
}

/** The user's local date, computed on a UTC server. */
export const localDateIn = (tz: string, t = Date.now()) => localDate(new Date(t + tzOffsetMs(tz, t)))

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

async function accessTokenFor(env: Env, refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: env.googleClientId, client_secret: env.googleClientSecret, grant_type: 'refresh_token' }),
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

export async function syncUser(env: Env, userId: string, token: string, scopes: string, tz: string): Promise<string> {
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
  const mapped = points.map((p) => toAppExercise(p, profile.weightKg, targets.bmr, learnTypes(exercises))).filter((x): x is NonNullable<typeof x> => !!x)
  const recent = exercises.filter((e) => e.started_at >= `${exFrom}T00:00:00`)
  const { added, updated, matched } = mergeImported(mapped, recent)
  const touched = new Set([...added, ...updated, ...matched].map((e) => e.id))
  const hrFixed: Exercise[] = []
  for (const e of recent.filter((x) => x.source === 'manual' && x.meta.caloriesEstimated && !touched.has(x.id))) {
    const r = await heartRateCalories(token, new Date(e.started_at), e.duration_min, { age: targets.age, sex: profile.sex, bmrPerDay: targets.bmr, weightKg: profile.weightKg }).catch(() => null)
    if (r) hrFixed.push({ ...e, calories: r.kcal, meta: { ...e.meta, caloriesEstimated: false, caloriesSource: 'heart-rate', avgHr: r.avgHr, hrSamples: r.samples } })
  }
  await d.upsert('exercises', forUser(userId, [...added, ...updated, ...matched, ...hrFixed]), 'id')
  notes.push(`${added.length} new workouts`)

  // Steps, burn, resting HR, HRV, sleep and weigh-ins since the last day here (at least a week).
  const activityRows = await d.select<ActivityDay>('daily_activity', `user_id=eq.${userId}&deleted_at=is.null`)
  const activity = Object.fromEntries(activityRows.map((a) => [a.id, a]))
  const lastDay = activityRows.filter((a) => a.steps != null).map((a) => a.day).sort().pop() ?? null
  const act = await fetchActivity(token, since(catchUpDays(lastDay, today, { min: 7, first: 30 }) - 1), today)
  const days = mergeActivity(act, activity)
  await d.upsert('daily_activity', forUser(userId, days), 'user_id,id')
  const weights = await d.select<ReadingRow>('readings', `user_id=eq.${userId}&kind=eq.weight`)
  const weighIns = await weightReadings(act, weights)
  await d.upsert('readings', forUser(userId, weighIns), 'id')
  notes.push(`${days.length} activity days`)
  if (act.skipped.length) notes.push(`not allowed: ${act.skipped.join(', ')}`)

  // Lingo glucose since the last CGM day here, grouped by the user's local day.
  const cgmRows = await d.select<CgmDay>('cgm_days', `user_id=eq.${userId}&deleted_at=is.null&day=gte.${since(120)}`)
  const cgm = Object.fromEntries(cgmRows.map((c) => [c.id, c]))
  const lastCgm = cgmRows.map((c) => c.day).sort().pop() ?? null
  const from = new Date(`${since(catchUpDays(lastCgm, today, { min: 3, first: 14 }) - 1)}T00:00:00Z`)
  const raw = await listGlucose(token, new Date(from.getTime() - tzOffsetMs(tz, from.getTime())), new Date())
  // Shift each reading to local wall-clock time so the (UTC) server buckets it into the right day and minute.
  const readings = raw.map(parseGlucosePoint).filter((r): r is NonNullable<typeof r> => !!r).map((r) => ({ ...r, t: r.t + tzOffsetMs(tz, r.t) }))
  const cgmDays = mergeIntoDays(readings, cgm)
  await d.upsert('cgm_days', forUser(userId, cgmDays), 'user_id,id')
  notes.push(`${readings.length} glucose readings`)

  // Weekly Drive backup, when Drive was allowed at linking.
  if (scopes.includes(DRIVE_SCOPE) && backupDue(profile.lastBackupAt)) {
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
    const r = await backupToDrive(token, JSON.stringify(bundle), `keto-tracker-${today}.json`, profile.backupFolderId)
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
      const access = await accessTokenFor(env, t.refresh_token)
      const result = await syncUser(env, t.user_id, access, t.scopes, tz)
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
    const result = await syncUser(env, userId, g.accessToken, g.scopes, tz)
    await d.upsert('sync_status', [{ user_id: userId, last_sync_at: new Date().toISOString(), last_result: result, updated_at: new Date().toISOString() }], 'user_id')
    return result
  } catch (e) {
    await d.upsert('sync_status', [{ user_id: userId, last_error: (e as Error).message, updated_at: new Date().toISOString() }], 'user_id')
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
