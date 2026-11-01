import { heartRateKcal, type CardioType, type Exercise, type ExerciseKind, type Intensity } from './exercise'

/** OAuth client for the "Keto Tracker" Google Cloud project. Client IDs are public by design. */
export const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  '579706392010-f9v75bfl95tcgbuftcvodajimck9dv37.apps.googleusercontent.com'

const SCOPE = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
].join(' ')
/** Weekly backups: only files this app creates in Drive. Asked for separately, so health imports never depend on it. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const API = 'https://health.googleapis.com/v4/users/me'

// --- Sign-in (Google Identity Services token flow: no secret, no server) ---------------

interface TokenResponse {
  access_token?: string
  expires_in?: number
  /** Space-separated scopes the person actually allowed (they can untick some). */
  scope?: string
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
            include_granted_scopes?: boolean
            callback: (r: TokenResponse) => void
            error_callback?: (e: { type: string; message?: string }) => void
          }) => TokenClient
          initCodeClient: (cfg: {
            client_id: string
            scope: string
            ux_mode: 'popup'
            callback: (r: { code?: string; error?: string; error_description?: string }) => void
            error_callback?: (e: { type: string; message?: string }) => void
          }) => { requestCode: () => void }
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
const keyFor = (scope: string) => (scope === SCOPE ? TOKEN_KEY : `${TOKEN_KEY}.${scope.split('/').pop()}`)

/** A token from earlier this session for the given scope, if it's still valid (no popup). */
export function cachedToken(scope = SCOPE): string | null {
  try {
    const raw = sessionStorage.getItem(keyFor(scope))
    if (!raw) return null
    const { token, expires } = JSON.parse(raw) as { token: string; expires: number }
    return Date.now() < expires - 60_000 ? token : null
  } catch {
    return null
  }
}

/**
 * Set when Google refused data (403). Without it the next sign-in silently reuses the old grant
 * and never shows the boxes again, so the same error repeats on every tap.
 */
let consentNeeded = false

/** Gets an access token, showing Google's sign-in/consent popup when needed. Must run from a tap. */
export async function getGoogleToken(forceConsent = false, scope = SCOPE): Promise<string> {
  forceConsent ||= consentNeeded
  const cached = !forceConsent && cachedToken(scope)
  if (cached) return cached
  await loadGis()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope,
      // Google Health refuses tokens that also carry other APIs' scopes (like Drive, once background sync was linked),
      // so ask for exactly these scopes, not everything granted before.
      include_granted_scopes: false,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || 'Google sign-in was cancelled.'))
        const missing = scope.split(' ').filter((s) => r.scope && !r.scope.split(' ').includes(s))
        if (missing.length) {
          consentNeeded = true
          const names = missing.map((s) => s.split('.').at(-2)?.replace(/_/g, ' ')).join(', ')
          return reject(new Error(`Google sign-in left out: ${names}. Tap Import again and tick every box.`))
        }
        consentNeeded = false
        try {
          sessionStorage.setItem(keyFor(scope), JSON.stringify({ token: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 }))
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

/**
 * Asks Google for a one-time code (popup) that the server trades for background access, so it can
 * sync every few hours without the app open. Must run from a tap.
 */
export async function getGoogleCode(withDrive = true): Promise<string> {
  await loadGis()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: withDrive ? `${SCOPE} ${DRIVE_SCOPE}` : SCOPE,
      ux_mode: 'popup',
      callback: (r) => (r.code ? resolve(r.code) : reject(new Error(r.error_description || r.error || 'Google sign-in was cancelled.'))),
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Google sign-in was closed.' : e.message || e.type)),
    })
    client.requestCode()
  })
}

/** Google's own explanation from an error response, e.g. "(Google: Request had insufficient authentication scopes.)". */
async function googleReason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    return body.error?.message ? `(Google: ${body.error.message})` : ''
  } catch {
    return ''
  }
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
      consentNeeded = true
      const reason = await googleReason(res)
      throw new Error(`${/disallowed OAuth scope/i.test(reason) ? 'Google refused this sign-in. Tap Import again.' : 'Google needs your OK to read glucose. Tap Import again and tick "health metrics".'} ${reason}`)
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

// --- Daily activity: steps, calories burned, resting heart rate, sleep, weight -------------

/** Thrown for a 403: the saved sign-in doesn't cover this data type yet. */
export class NeedsConsentError extends Error {}

async function healthFetch(token: string, url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' } })
  if (res.status === 401) {
    forgetGoogleToken()
    throw new Error('Google sign-in expired. Tap Import again.')
  }
  if (res.status === 403) {
    forgetGoogleToken()
    consentNeeded = true
    throw new NeedsConsentError(`Google needs your OK for this data. Tap Import again and allow it. ${await googleReason(res)}`)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Google Health returned ${res.status}. ${body.slice(0, 300)}`)
  }
  return res.json()
}

/** Lists data points of one type with a filter, following pages. */
async function listPoints(token: string, dataType: string, filter: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({ filter, pageSize: '100' })
    if (pageToken) params.set('pageToken', pageToken)
    const data = (await healthFetch(token, `${API}/dataTypes/${dataType}/dataPoints?${params}`)) as {
      dataPoints?: Record<string, unknown>[]
      nextPageToken?: string
    }
    out.push(...(data.dataPoints ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

const civilDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return { date: { year, month, day }, time: { hours: 0, minutes: 0, seconds: 0 } }
}
const fromCivil = (c: unknown): string | null => {
  const d = (c as { date?: { year?: number; month?: number; day?: number } } | undefined)?.date ?? (c as { year?: number; month?: number; day?: number })
  if (!d?.year || !d.month || !d.day) return null
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}
const addDays = (date: string, n: number) => civil(date, n).slice(0, 10)

/** One value per day from dailyRollUp (steps, total-calories); at most 14 days per call. */
export async function dailyRollup(token: string, dataType: string, fromDate: string, toDate: string): Promise<{ day: string; value: Record<string, unknown> }[]> {
  const out: { day: string; value: Record<string, unknown> }[] = []
  for (let start = fromDate; start <= toDate; start = addDays(start, 14)) {
    const end = addDays(start, 14) > addDays(toDate, 1) ? addDays(toDate, 1) : addDays(start, 14)
    const data = (await healthFetch(token, `${API}/dataTypes/${dataType}/dataPoints:dailyRollUp`, {
      method: 'POST',
      body: JSON.stringify({ range: { start: civilDate(start), end: civilDate(end) }, windowSizeDays: 1 }),
    })) as { rollupDataPoints?: Record<string, unknown>[] }
    for (const p of data.rollupDataPoints ?? []) {
      const day = fromCivil(p.civilStartTime)
      const value = Object.entries(p).find(([k]) => k !== 'civilStartTime' && k !== 'civilEndTime')?.[1] as Record<string, unknown> | undefined
      if (day && value) out.push({ day, value })
    }
  }
  return out
}

export interface SleepNight {
  /** Local date the sleep ended (the morning). */
  day: string
  start: string
  end: string
  asleepMin: number
  inBedMin: number
  stages: Partial<Record<'DEEP' | 'REM' | 'LIGHT' | 'AWAKE', number>>
}

export function parseSleep(p: Record<string, unknown>): SleepNight | null {
  const s = p.sleep as
    | {
        interval?: { startTime?: string; endTime?: string; civilEndTime?: unknown }
        summary?: { minutesAsleep?: string | number; minutesInSleepPeriod?: string | number; stagesSummary?: { type?: string; minutes?: string | number }[] }
      }
    | undefined
  const start = s?.interval?.startTime
  const end = s?.interval?.endTime
  if (!start || !end) return null
  const inBed = Number(s?.summary?.minutesInSleepPeriod) || Math.round((Date.parse(end) - Date.parse(start)) / 60_000)
  const stages: SleepNight['stages'] = {}
  for (const st of s?.summary?.stagesSummary ?? []) {
    const t = st.type?.toUpperCase()
    if (t === 'DEEP' || t === 'REM' || t === 'LIGHT' || t === 'AWAKE') stages[t] = Number(st.minutes) || 0
  }
  const day = fromCivil(s?.interval?.civilEndTime) ?? localDay(new Date(end))
  return { day, start, end, asleepMin: Number(s?.summary?.minutesAsleep) || inBed - (stages.AWAKE ?? 0), inBedMin: inBed, stages }
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export interface ActivityImport {
  steps: Record<string, number>
  caloriesOut: Record<string, number>
  restingHr: Record<string, number>
  /** Overnight HRV (RMSSD, ms) by the morning it was measured. */
  hrv: Record<string, number>
  sleep: SleepNight[]
  weights: { id: string; at: string; kg: number }[]
  bodyFat: { at: string; pct: number }[]
  /** Parts that couldn't be read, e.g. sleep before the user allows it. */
  skipped: string[]
}

/** Pulls daily activity for a date range. Each part fails on its own so one missing permission doesn't block the rest. */
export async function fetchActivity(token: string, fromDate: string, toDate: string): Promise<ActivityImport> {
  const out: ActivityImport = { steps: {}, caloriesOut: {}, restingHr: {}, hrv: {}, sleep: [], weights: [], bodyFat: [], skipped: [] }
  const civilRange = (field: string) => `${field} >= "${civil(fromDate)}" AND ${field} < "${civil(toDate, 1)}"`
  const part = async (label: string, run: () => Promise<void>) => {
    try {
      await run()
    } catch (e) {
      if (e instanceof NeedsConsentError) out.skipped.push(label)
      else throw e
    }
  }
  await part('steps', async () => {
    for (const r of await dailyRollup(token, 'steps', fromDate, toDate)) out.steps[r.day] = Number(r.value.countSum) || 0
  })
  await part('calories burned', async () => {
    for (const r of await dailyRollup(token, 'total-calories', fromDate, toDate)) out.caloriesOut[r.day] = Math.round(Number(r.value.kcalSum) || 0)
  })
  await part('resting heart rate', async () => {
    for (const p of await listPoints(token, 'daily-resting-heart-rate', `daily_resting_heart_rate.date >= "${fromDate}" AND daily_resting_heart_rate.date < "${addDays(toDate, 1)}"`)) {
      const v = p.dailyRestingHeartRate as { date?: unknown; beatsPerMinute?: string | number } | undefined
      const day = fromCivil(v?.date)
      const bpm = Number(v?.beatsPerMinute)
      if (day && bpm > 0) out.restingHr[day] = bpm
    }
  })
  await part('heart rate variability', async () => {
    for (const p of await listPoints(token, 'daily-heart-rate-variability', `daily_heart_rate_variability.date >= "${fromDate}" AND daily_heart_rate_variability.date < "${addDays(toDate, 1)}"`)) {
      const v = p.dailyHeartRateVariability as { date?: unknown; averageHeartRateVariabilityMilliseconds?: number } | undefined
      const day = fromCivil(v?.date)
      const ms = Number(v?.averageHeartRateVariabilityMilliseconds)
      if (day && ms > 0) out.hrv[day] = Math.round(ms * 10) / 10
    }
  })
  await part('sleep', async () => {
    for (const p of await listPoints(token, 'sleep', civilRange('sleep.interval.civil_end_time'))) {
      const n = parseSleep(p)
      if (n) out.sleep.push(n)
    }
  })
  await part('weight', async () => {
    for (const p of await listPoints(token, 'weight', civilRange('weight.sample_time.civil_time'))) {
      const w = p.weight as { sampleTime?: { physicalTime?: string }; weightGrams?: number } | undefined
      if (w?.sampleTime?.physicalTime && w.weightGrams) out.weights.push({ id: String(p.name ?? w.sampleTime.physicalTime), at: w.sampleTime.physicalTime, kg: w.weightGrams / 1000 })
    }
    for (const p of await listPoints(token, 'body-fat', civilRange('body_fat.sample_time.civil_time'))) {
      const b = p.bodyFat as { sampleTime?: { physicalTime?: string }; percentage?: number } | undefined
      if (b?.sampleTime?.physicalTime && b.percentage) out.bodyFat.push({ at: b.sampleTime.physicalTime, pct: b.percentage })
    }
  })
  return out
}

// --- Heart rate during a workout ----------------------------------------------------------

export interface HrSample {
  t: number
  bpm: number
}

export function parseHeartRate(p: Record<string, unknown>): HrSample | null {
  const h = p.heartRate as { beatsPerMinute?: string | number; sampleTime?: { physicalTime?: string } } | undefined
  const t = Date.parse(h?.sampleTime?.physicalTime ?? '')
  const bpm = Number(h?.beatsPerMinute)
  return Number.isFinite(t) && bpm > 0 ? { t, bpm } : null
}

/** Heart-rate samples between two moments (Fitbit records one every few seconds during exercise). */
export async function listHeartRate(token: string, from: Date, to: Date): Promise<HrSample[]> {
  const utc = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const field = 'heart_rate.sample_time.physical_time'
  const out: HrSample[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({ filter: `${field} >= "${utc(from)}" AND ${field} < "${utc(to)}"`, pageSize: '1000' })
    if (pageToken) params.set('pageToken', pageToken)
    const data = (await healthFetch(token, `${API}/dataTypes/heart-rate/dataPoints?${params}`)) as {
      dataPoints?: Record<string, unknown>[]
      nextPageToken?: string
    }
    for (const p of data.dataPoints ?? []) {
      const h = parseHeartRate(p)
      if (h) out.push(h)
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

/** Time-weighted average, so a burst of samples doesn't outweigh a quiet stretch. */
export function averageHr(samples: HrSample[], from: number, to: number): number | null {
  const s = samples.filter((x) => x.t >= from && x.t <= to).sort((a, b) => a.t - b.t)
  if (s.length < 3) return null
  let sum = 0
  let span = 0
  for (let i = 0; i < s.length; i++) {
    // Each sample counts until the next one, capped at 60 s so gaps in the data don't dominate.
    const next = i + 1 < s.length ? s[i + 1].t : Math.min(to, s[i].t + 5_000)
    const w = Math.min(60_000, Math.max(1_000, next - s[i].t))
    sum += s[i].bpm * w
    span += w
  }
  return Math.round(sum / span)
}

export interface HrProfile {
  weightKg: number
  age: number
  sex: 'male' | 'female' | 'unspecified'
  bmrPerDay: number | null
}

/** Calories for a session from the Fitbit heart rate recorded during it, or null without enough data. */
export async function heartRateCalories(
  token: string,
  start: Date,
  minutes: number,
  who: HrProfile,
): Promise<{ kcal: number; avgHr: number; samples: number } | null> {
  const end = new Date(start.getTime() + minutes * 60_000)
  const samples = await listHeartRate(token, start, end)
  const avgHr = averageHr(samples, start.getTime(), end.getTime())
  if (avgHr == null) return null
  return { kcal: heartRateKcal({ avgHr, minutes, ...who }), avgHr, samples: samples.length }
}

// --- Matching to the app's exercise types ----------------------------------------------

export function classifyExercise(type: string, displayName = ''): { kind: ExerciseKind; cardioType?: CardioType } {
  const t = `${type} ${displayName}`.toUpperCase()
  if (/STAIR|STEP ?MILL|STAIRMASTER/.test(t)) return { kind: 'cardio', cardioType: 'stairmaster' }
  if (/RUN|JOG|TREADMILL/.test(t)) return { kind: 'cardio', cardioType: 'running' }
  if (/YOGA|PILATES|STRETCH/.test(t)) return { kind: 'mobility' }
  if (/WEIGHT|STRENGTH|LIFT|RESISTANCE/.test(t)) return { kind: 'strength' }
  if (/WALK|HIKE/.test(t)) return { kind: 'walking' }
  if (/HIIT|INTERVAL|CIRCUIT/.test(t)) return { kind: 'hiit' }
  if (/BIKE|BIKING|CYCL|SPIN/.test(t)) return { kind: 'cardio', cardioType: 'cycling' }
  if (/ELLIPTICAL|ROW|SWIM|CARDIO/.test(t)) return { kind: 'cardio' }
  if (/TENNIS|SOCCER|BASKETBALL|SPORT|GOLF|PADEL|PICKLEBALL/.test(t)) return { kind: 'sport' }
  return { kind: 'other' }
}

const seconds = (d?: string) => (d && /^[\d.]+s$/.test(d) ? Number(d.slice(0, -1)) : null)

/**
 * Turns a Google Health exercise into the app's shape. Fitbit's calories include the body's
 * resting burn during the session, so that part is subtracted to keep active calories only.
 */
/** Fitbit type → the type you corrected it to, learned from sessions you edited. */
export type LearnedTypes = Record<string, { kind: ExerciseKind; cardioType?: CardioType }>

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
      distanceMi: cardioType === 'running' || cardioType === 'cycling' || kind === 'walking' ? miles : undefined,
      yogaStyle: kind === 'mobility' ? 'flow' : undefined,
      fitbitTotalKcal: total ?? undefined,
      fitbitType: e.exerciseType,
      steps: e.metricsSummary?.steps,
      avgHr: e.metricsSummary?.averageHeartRateBeatsPerMinute,
    },
  }
}

/**
 * Copies of the same workout: rows with the same Fitbit id, or Fitbit rows of the same type that start
 * the same minute and last as long (the phone and the background sync can both import a session before
 * either sees the other's row). Returns the ids to remove, keeping the one you edited, else the oldest.
 */
export function duplicateExercises(rows: Exercise[]): string[] {
  const live = rows.filter((e) => !e.deleted_at)
  const groups = new Map<string, Exercise[]>()
  const keyOf = (e: Exercise) =>
    e.source === 'fitbit' ? `${e.kind}|${e.meta.cardioType ?? ''}|${e.started_at.slice(0, 16)}|${Math.round(e.duration_min)}` : null
  for (const e of live) {
    // Rows sharing a Fitbit id, or the same session by time, land in one group.
    const keys = [e.external_id ? `id:${e.external_id}` : null, keyOf(e)].filter((k): k is string => !!k)
    const found = keys.map((k) => groups.get(k)).find((g) => g)
    const group = found ?? []
    group.push(e)
    for (const k of keys) groups.set(k, group)
  }
  const remove: string[] = []
  for (const group of new Set(groups.values())) {
    if (group.length < 2) continue
    const keep = [...group].sort(
      (a, b) => Number(!!b.meta.userEdited) - Number(!!a.meta.userEdited) || a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id),
    )[0]
    for (const e of group) if (e.id !== keep.id) remove.push(e.id)
  }
  return remove
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
