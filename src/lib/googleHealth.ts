import type { Exercise, ExerciseKind, Intensity } from './exercise'

/** OAuth client for the "Keto Tracker" Google Cloud project. Client IDs are public by design. */
export const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  '579706392010-f9v75bfl95tcgbuftcvodajimck9dv37.apps.googleusercontent.com'

const SCOPE = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
].join(' ')
const API = 'https://health.googleapis.com/v4/users/me'

// --- Sign-in (Google Identity Services token flow: no secret, no server) ---------------

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}
interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string
            scope: string
            callback: (r: TokenResponse) => void
            error_callback?: (e: { type: string; message?: string }) => void
          }) => TokenClient
        }
      }
    }
  }
}

let gisLoading: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  gisLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error("Couldn't load Google sign-in. Check your connection."))
    document.head.appendChild(s)
  })
  return gisLoading
}

const TOKEN_KEY = 'keto.googleHealth.token'

function cachedToken(): string | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const { token, expires } = JSON.parse(raw) as { token: string; expires: number }
    return Date.now() < expires - 60_000 ? token : null
  } catch {
    return null
  }
}

/** Gets an access token, showing Google's sign-in/consent popup when needed. Must run from a tap. */
export async function getGoogleToken(forceConsent = false): Promise<string> {
  const cached = !forceConsent && cachedToken()
  if (cached) return cached
  await loadGis()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || 'Google sign-in was cancelled.'))
        try {
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 }))
        } catch {
          // Token just won't be reused this session.
        }
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Google sign-in was closed.' : e.message || e.type)),
    })
    client.requestAccessToken({ prompt: forceConsent ? 'consent' : '' })
  })
}

export function forgetGoogleToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing cached.
  }
}

// --- Reading exercise sessions ---------------------------------------------------------

/** Exercise data point as returned by the Google Health API (fields we use). */
export interface HealthExercise {
  name: string
  exercise?: {
    interval?: { startTime?: string; endTime?: string }
    exerciseType?: string
    displayName?: string
    activeDuration?: string
    metricsSummary?: {
      caloriesKcal?: number
      distanceMillimiters?: number
      distanceMillimeters?: number
      steps?: number
      averageHeartRateBeatsPerMinute?: number
    }
  }
}

/** "YYYY-MM-DDT00:00:00" civil (local) times for the start and end of a day. */
const civil = (date: string, plusDays = 0) => {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + plusDays)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T00:00:00`
}

export async function listExercises(token: string, fromDate: string, toDate: string): Promise<HealthExercise[]> {
  const out: HealthExercise[] = []
  let pageToken: string | undefined
  const filter = `exercise.interval.civil_start_time >= "${civil(fromDate)}" AND exercise.interval.civil_start_time < "${civil(toDate, 1)}"`
  do {
    const params = new URLSearchParams({ filter, pageSize: '100' })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await fetch(`${API}/dataTypes/exercise/dataPoints?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (res.status === 401) {
      forgetGoogleToken()
      throw new Error('Google sign-in expired. Tap Import again.')
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Google Health returned ${res.status}. ${body.slice(0, 300)}`)
    }
    const data = (await res.json()) as { dataPoints?: HealthExercise[]; nextPageToken?: string }
    out.push(...(data.dataPoints ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

// --- Reading glucose (Lingo and other CGMs connected to Google Health) ---------------

export async function listGlucose(token: string, from: Date, to: Date): Promise<unknown[]> {
  const out: unknown[] = []
  let pageToken: string | undefined
  do {
    // Sample-type data is filtered on physical (UTC) time, e.g. blood_glucose.sample_time.physical_time.
    const utc = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')
    const field = 'blood_glucose.sample_time.physical_time'
    const params = new URLSearchParams({
      filter: `${field} >= "${utc(from)}" AND ${field} < "${utc(to)}"`,
      pageSize: '1000',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await fetch(`${API}/dataTypes/blood-glucose/dataPoints?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (res.status === 401) {
      forgetGoogleToken()
      throw new Error('Google sign-in expired. Tap Import again.')
    }
    if (res.status === 403) {
      forgetGoogleToken()
      throw new Error('Google needs your OK to read glucose. Tap Import again and allow "health metrics".')
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Google Health returned ${res.status}. ${body.slice(0, 300)}`)
    }
    const data = (await res.json()) as { dataPoints?: unknown[]; nextPageToken?: string }
    out.push(...(data.dataPoints ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

// --- Matching to the app's exercise types ----------------------------------------------

export function classifyExercise(type: string, displayName = ''): { kind: ExerciseKind; cardioType?: 'running' | 'stairmaster' } {
  const t = `${type} ${displayName}`.toUpperCase()
  if (/STAIR|STEP ?MILL|STAIRMASTER/.test(t)) return { kind: 'cardio', cardioType: 'stairmaster' }
  if (/RUN|JOG|TREADMILL/.test(t)) return { kind: 'cardio', cardioType: 'running' }
  if (/YOGA|PILATES|STRETCH/.test(t)) return { kind: 'mobility' }
  if (/WEIGHT|STRENGTH|LIFT|RESISTANCE/.test(t)) return { kind: 'strength' }
  if (/WALK|HIKE/.test(t)) return { kind: 'walking' }
  if (/HIIT|INTERVAL|CIRCUIT/.test(t)) return { kind: 'hiit' }
  if (/BIKE|CYCL|SPIN|ELLIPTICAL|ROW|SWIM|CARDIO/.test(t)) return { kind: 'cardio' }
  if (/TENNIS|SOCCER|BASKETBALL|SPORT|GOLF|PADEL|PICKLEBALL/.test(t)) return { kind: 'sport' }
  return { kind: 'other' }
}

const seconds = (d?: string) => (d && /^[\d.]+s$/.test(d) ? Number(d.slice(0, -1)) : null)

/**
 * Turns a Google Health exercise into the app's shape. Fitbit's calories include the body's
 * resting burn during the session, so that part is subtracted to keep active calories only.
 */
/** Fitbit type → the type you corrected it to, learned from sessions you edited. */
export type LearnedTypes = Record<string, { kind: ExerciseKind; cardioType?: 'running' | 'stairmaster' }>

export function learnTypes(exercises: Exercise[]): LearnedTypes {
  const map: LearnedTypes = {}
  // Oldest first, so the most recent correction wins.
  for (const e of [...exercises].sort((a, b) => a.updated_at.localeCompare(b.updated_at))) {
    if (e.meta.userEdited && e.meta.fitbitType) map[e.meta.fitbitType] = { kind: e.kind, cardioType: e.meta.cardioType }
  }
  return map
}

/** Slower than this (minutes per mile) a Fitbit "run" is really walking. */
export const WALKING_PACE_MIN_PER_MI = 15

export function toAppExercise(
  p: HealthExercise,
  weightKg: number,
  restingKcalPerDay: number | null,
  learned: LearnedTypes = {},
): Omit<Exercise, 'id' | 'updated_at' | 'deleted_at'> | null {
  const e = p.exercise
  const start = e?.interval?.startTime
  if (!e || !start) return null
  const end = e.interval?.endTime
  const active = seconds(e.activeDuration)
  const minutes = Math.max(1, Math.round((active ?? (end ? (Date.parse(end) - Date.parse(start)) / 1000 : 0)) / 60))
  const mm = e.metricsSummary?.distanceMillimiters ?? e.metricsSummary?.distanceMillimeters
  const miles = mm ? Math.round((mm / 1_609_344) * 100) / 100 : null
  let { kind, cardioType } = learned[e.exerciseType ?? ''] ?? classifyExercise(e.exerciseType ?? '', e.displayName)
  let note: string | null = null
  if (cardioType === 'running' && miles && minutes / miles > WALKING_PACE_MIN_PER_MI) {
    kind = 'walking'
    cardioType = undefined
    note = `Fitbit called this a run, but ${Math.round(minutes / miles)} min/mi is walking pace`
  }
  const total = e.metricsSummary?.caloriesKcal
  const resting = ((restingKcalPerDay ?? weightKg * 24) / 1440) * minutes
  const activeKcal = total != null ? Math.max(0, Math.round(total - resting)) : null
  // Intensity from energy cost: METs above rest.
  const met = activeKcal != null ? 1 + activeKcal / (weightKg * (minutes / 60)) : null
  const intensity: Intensity = met == null ? 'moderate' : met < 4 ? 'low' : met < 7.5 ? 'moderate' : 'high'
  return {
    started_at: new Date(start).toISOString(),
    kind,
    duration_min: minutes,
    intensity,
    calories: activeKcal,
    source: 'fitbit',
    external_id: p.name,
    note,
    meta: {
      caloriesEstimated: total == null,
      cardioType,
      distanceMi: cardioType === 'running' || kind === 'walking' ? miles : undefined,
      yogaStyle: kind === 'mobility' ? 'flow' : undefined,
      fitbitTotalKcal: total ?? undefined,
      fitbitType: e.exerciseType,
      steps: e.metricsSummary?.steps,
      avgHr: e.metricsSummary?.averageHeartRateBeatsPerMinute,
    },
  }
}

export interface ImportResult {
  added: Exercise[]
  updated: Exercise[]
  matched: Exercise[]
}

/**
 * Merges imported sessions with what's logged: same Fitbit id → update; a manual session of the
 * same kind starting within 90 minutes → keep the user's details (lifts, fasted, notes) and fill in
 * Fitbit's numbers; otherwise add it.
 */
export function mergeImported(
  imported: Omit<Exercise, 'id' | 'updated_at' | 'deleted_at'>[],
  existing: Exercise[],
  now = new Date().toISOString(),
): ImportResult {
  const result: ImportResult = { added: [], updated: [], matched: [] }
  const used = new Set<string>()
  for (const imp of imported) {
    const same = existing.find((e) => e.external_id === imp.external_id)
    if (same) {
      used.add(same.id)
      // Your edits win: keep the type and details you set, refresh only Fitbit's numbers.
      const keep = same.meta.userEdited
        ? { kind: same.kind, intensity: same.intensity, meta: { ...imp.meta, ...same.meta, fitbitTotalKcal: imp.meta.fitbitTotalKcal } }
        : { meta: { ...same.meta, ...imp.meta, fasted: same.meta.fasted, lifts: same.meta.lifts } }
      result.updated.push({ ...same, ...imp, ...keep, note: same.note ?? imp.note, updated_at: now })
      continue
    }
    const manual = existing.find(
      (e) =>
        !used.has(e.id) &&
        !e.external_id &&
        e.kind === imp.kind &&
        (imp.kind !== 'cardio' || !e.meta.cardioType || !imp.meta.cardioType || e.meta.cardioType === imp.meta.cardioType) &&
        Math.abs(Date.parse(e.started_at) - Date.parse(imp.started_at)) <= 90 * 60_000,
    )
    if (manual) {
      used.add(manual.id)
      result.matched.push({
        ...manual,
        started_at: imp.started_at,
        duration_min: imp.duration_min,
        intensity: imp.intensity,
        calories: imp.calories ?? manual.calories,
        source: 'fitbit',
        external_id: imp.external_id,
        meta: {
          ...imp.meta,
          ...manual.meta,
          distanceMi: imp.meta.distanceMi ?? manual.meta.distanceMi,
          caloriesEstimated: imp.calories == null,
          fitbitTotalKcal: imp.meta.fitbitTotalKcal,
          fitbitType: imp.meta.fitbitType,
        },
        updated_at: now,
      })
      continue
    }
    result.added.push({ ...imp, id: crypto.randomUUID(), updated_at: now, deleted_at: null })
  }
  return result
}
