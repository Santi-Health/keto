import { deviceTz } from './time'
export type ExerciseKind = 'strength' | 'cardio' | 'hiit' | 'walking' | 'sport' | 'mobility' | 'other'
export type Intensity = 'low' | 'moderate' | 'high'

/** Every kind the data can hold (Fitbit may import others); `shown` are the ones offered when logging. */
export const EXERCISE_KINDS: { value: ExerciseKind; label: string; emoji: string; shown?: boolean }[] = [
  { value: 'mobility', label: 'Yoga', emoji: '🧘', shown: true },
  { value: 'strength', label: 'Strength', emoji: '🏋️', shown: true },
  { value: 'cardio', label: 'Cardio', emoji: '🏃', shown: true },
  { value: 'hiit', label: 'HIIT', emoji: '⚡' },
  { value: 'walking', label: 'Walking', emoji: '🚶' },
  { value: 'sport', label: 'Sport', emoji: '🎾' },
  { value: 'other', label: 'Other', emoji: '✳️' },
]

export type CardioType = 'stairmaster' | 'running' | 'cycling'
export type YogaStyle = 'gentle' | 'flow' | 'power'

export const CARDIO_TYPES: { value: CardioType; label: string; emoji: string }[] = [
  { value: 'stairmaster', label: 'StairMaster', emoji: '🪜' },
  { value: 'running', label: 'Running', emoji: '🏃' },
  { value: 'cycling', label: 'Cycling', emoji: '🚴' },
]

export const YOGA_STYLES: { value: YogaStyle; label: string; met: number }[] = [
  { value: 'gentle', label: 'Gentle / hatha', met: 2.5 },
  { value: 'flow', label: 'Flow / vinyasa', met: 3.3 },
  { value: 'power', label: 'Power / hot', met: 4 },
]

/** StairMaster (stair-treadmill) METs by effort, from the Compendium of Physical Activities. */
const STAIRMASTER_MET: Record<Intensity, number> = { low: 6, moderate: 9, high: 11 }

/** Running MET from speed in mph (Compendium: 5 mph ≈ 8.3, 6 ≈ 9.8, 7 ≈ 11). */
export const runningMet = (mph: number) => Math.max(6, 1.45 * mph + 1.05)

/** Cycling METs by effort when the speed isn't known (Compendium: leisure, moderate, vigorous). */
const CYCLING_MET: Record<Intensity, number> = { low: 4, moderate: 6.8, high: 10 }

/** Road cycling MET from speed in mph (Compendium: <10 mph 4, 10–12 6.8, 12–14 8, 14–16 10, 16–20 12, 20+ 15.8). */
export function cyclingMet(mph: number): number {
  if (mph < 10) return 4
  if (mph < 12) return 6.8
  if (mph < 14) return 8
  if (mph < 16) return 10
  if (mph < 20) return 12
  return 15.8
}

/** Miles per hour, e.g. "14 mph". */
export const speed = (distanceMi: number, minutes: number) => `${Math.round((distanceMi / (minutes / 60)) * 10) / 10} mph`

export interface ExerciseDetails {
  cardioType?: CardioType
  distanceMi?: number | null
  floors?: number | null
  level?: number | null
  yogaStyle?: YogaStyle
}

/** MET for a session, using the details when they're known. */
export function sessionMet(kind: ExerciseKind, intensity: Intensity, minutes: number, d: ExerciseDetails = {}): number {
  if (kind === 'mobility' && d.yogaStyle) return YOGA_STYLES.find((y) => y.value === d.yogaStyle)!.met
  if (kind === 'cardio' && d.cardioType === 'stairmaster') return STAIRMASTER_MET[intensity]
  if (kind === 'cardio' && d.cardioType === 'running' && d.distanceMi && minutes > 0) return runningMet(d.distanceMi / (minutes / 60))
  if (kind === 'cardio' && d.cardioType === 'cycling')
    return d.distanceMi && minutes > 0 ? cyclingMet(d.distanceMi / (minutes / 60)) : CYCLING_MET[intensity]
  return METS[kind][intensity]
}

/** Minutes per mile, e.g. "9:30 /mi". */
export function pace(distanceMi: number, minutes: number): string {
  const p = minutes / distanceMi
  const m = Math.floor(p)
  return `${m}:${String(Math.round((p - m) * 60)).padStart(2, '0')} /mi`
}

/**
 * Typical MET values (energy cost vs. sitting still) from the Compendium of Physical Activities,
 * by type and intensity.
 */
export const METS: Record<ExerciseKind, Record<Intensity, number>> = {
  strength: { low: 3.5, moderate: 5, high: 6 },
  cardio: { low: 5, moderate: 7.5, high: 10 },
  hiit: { low: 6, moderate: 8, high: 10 },
  walking: { low: 2.8, moderate: 3.5, high: 5 },
  sport: { low: 4.5, moderate: 6.5, high: 8.5 },
  mobility: { low: 2, moderate: 2.5, high: 4 },
  other: { low: 3, moderate: 5, high: 7 },
}

/**
 * Calories burned by the activity itself, on top of what the body burns at rest
 * (so it doesn't double count with resting burn): (MET − 1) × kg × hours.
 */
export function estimateExerciseKcal(
  kind: ExerciseKind,
  intensity: Intensity,
  minutes: number,
  weightKg: number,
  details: ExerciseDetails = {},
): number {
  return Math.round((sessionMet(kind, intensity, minutes, details) - 1) * weightKg * (minutes / 60))
}

/**
 * Active calories from average heart rate (Keytel et al. 2005, without VO2max), minus resting burn
 * for the same minutes so it matches how the app counts workouts. Most reliable above ~90 bpm;
 * at lower heart rates (gentle yoga) the formula drifts toward resting, so very low results are floored at 0.
 */
export function heartRateKcal(opts: {
  avgHr: number
  minutes: number
  weightKg: number
  age: number
  sex: 'male' | 'female' | 'unspecified'
  bmrPerDay: number | null
}): number {
  const { avgHr, minutes, weightKg, age, sex, bmrPerDay } = opts
  const male = (-55.0969 + 0.6309 * avgHr + 0.1988 * weightKg + 0.2017 * age) / 4.184
  const female = (-20.4022 + 0.4472 * avgHr - 0.1263 * weightKg + 0.074 * age) / 4.184
  const perMin = sex === 'male' ? male : sex === 'female' ? female : (male + female) / 2
  const resting = (bmrPerDay ?? weightKg * 24) / 1440
  return Math.max(0, Math.round((perMin - resting) * minutes))
}

export type WeightUnit = 'lb' | 'kg'
export const GYM_IDS = ['41', 'MP2', 'Home'] as const
export type GymId = (typeof GYM_IDS)[number]

export interface Lift {
  name: string
  /** Legacy field, always lb. Read it with liftWeight(). */
  weightLb: number | null
  /** Weight as entered, in `unit`. On an assisted machine this is the assist weight. */
  weight?: number | null
  unit?: WeightUnit
  reps: number | null
  sets: number | null
  /** Assisted machine: the weight offsets body weight, so a lower number is harder. */
  assisted?: boolean
  gym?: GymId
  /** Two kettlebells or dumbbells: the weight is one bell and the load is twice it. Reps split between arms only when alternating (side 'both'). */
  bells?: 2
  /** One arm or leg at a time: which side, or alternating sides with the reps (the total) split evenly. */
  side?: LiftSide
  /** How it's measured: reps (the default), or a hold or cardio piece timed in seconds or minutes. */
  measure?: LiftMeasure
  /** Time per set, in `measure` units, for timed lifts. */
  duration?: number | null
  /** Muscle group you picked for a lift the app didn't know. */
  group?: string
  /**
   * Reps (or seconds/minutes for timed pieces) for each set, when they weren't all the same. `reps`/`duration` then
   * hold their average and `sets` their count.
   */
  setAmounts?: number[]
  note?: string
}

export type LiftSide = 'left' | 'right' | 'both'
export type LiftMeasure = 'reps' | 's' | 'min'

/** True for holds and cardio pieces logged by time instead of reps. */
export const isTimed = (l: Pick<Lift, 'measure'>) => l.measure === 's' || l.measure === 'min'

/** Total weight moved per rep: both bells together when there are two. */
export function liftLoadKg(l: Lift): number | null {
  const kg = liftKg(l)
  return kg == null ? null : kg * (l.bells ?? 1)
}

/**
 * Reps each arm or leg did: half the total when alternating sides; otherwise all of them, including two bells
 * moved together (each arm does every rep).
 */
export function repsPerSide(l: Lift): number | null {
  if (l.reps == null) return null
  return l.side === 'both' ? l.reps / 2 : l.reps
}

/** Weight as entered; falls back to the legacy lb field for older entries. */
export function liftWeight(l: Lift): number | null {
  return l.weight ?? l.weightLb ?? null
}

export function liftUnit(l: Lift): WeightUnit {
  return l.unit ?? 'lb'
}

/** Weight in kg, so sessions logged in lb or kg can be compared. */
export function liftKg(l: Lift): number | null {
  const w = liftWeight(l)
  if (w == null) return null
  return liftUnit(l) === 'kg' ? w : Math.round(w * 0.45359237 * 100) / 100
}

/** Row shape of the `exercises` table. */
export interface Exercise {
  id: string
  started_at: string
  kind: ExerciseKind
  duration_min: number
  intensity: Intensity
  /** Active calories (above resting). */
  calories: number | null
  source: 'manual' | 'fitbit'
  external_id: string | null
  note: string | null
  meta: ExerciseDetails & {
    fasted?: boolean
    lifts?: Lift[]
    caloriesEstimated?: boolean
    // From Fitbit / Google Health imports.
    fitbitTotalKcal?: number
    fitbitType?: string
    steps?: number
    avgHr?: number
    /** The time zone it was logged in. */
    tz?: string
    /** "heart-rate" when calories came from Fitbit heart rate during a hand-logged session. */
    caloriesSource?: 'heart-rate'
    /** Heart-rate samples behind avgHr, to show how much data there was. */
    hrSamples?: number
    /** Set when you change an imported session's type; re-imports keep your version. */
    userEdited?: boolean
    /** Logged in the app: calories (and the real start) come from Fitbit's recording of it once it syncs. */
    awaitingFitbit?: boolean
    /** How long the app worked out the workout took (6 minutes per exercise), to compare with Fitbit's recording. */
    appMinutes?: number
    /** How long Fitbit recorded it. */
    fitbitMinutes?: number
    /** The length you (or the 10% rule) settled on, kept when Fitbit re-imports. */
    chosenMinutes?: number
  }
  updated_at: string
  deleted_at: string | null
}

/** A session that counts as a hard training day for the muscle and ketosis checks. */
export const isHardSession = (e: Exercise) =>
  e.intensity === 'high' || e.duration_min >= 60 || (e.kind === 'strength' && e.duration_min >= 45)

/** Whole days since the most recent strength session, or null if none was ever logged. */
export function daysSinceStrength(exercises: Exercise[], now = new Date()): number | null {
  const last = exercises
    .filter((e) => e.kind === 'strength' && !e.deleted_at)
    .map((e) => Date.parse(e.started_at))
    .sort((a, b) => b - a)[0]
  if (last == null) return null
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfThatDay = new Date(last)
  startOfThatDay.setHours(0, 0, 0, 0)
  return Math.round((startOfToday.getTime() - startOfThatDay.getTime()) / 86_400_000)
}

/** Training-related muscle warnings for today, in plain words. */
export function trainingWarnings(opts: {
  exercisesToday: Exercise[]
  daysSinceStrength: number | null
  effectiveDeficit: number | null
  isRefeed: boolean
}): { level: 'yellow' | 'red'; text: string }[] {
  const out: { level: 'yellow' | 'red'; text: string }[] = []
  const d = opts.daysSinceStrength
  if (d == null) {
    out.push({ level: 'yellow', text: 'No strength training logged yet. Lifting is what tells your body to keep muscle while you lose fat.' })
  } else if (d >= 8) {
    out.push({ level: 'red', text: `${d} days since your last strength session. On a calorie deficit that raises the risk of losing muscle.` })
  } else if (d >= 5) {
    out.push({ level: 'yellow', text: `${d} days since your last strength session. Aim for 2–4 sessions a week to protect muscle.` })
  }
  const hard = opts.exercisesToday.some(isHardSession)
  if (hard && !opts.isRefeed && opts.effectiveDeficit != null && opts.effectiveDeficit > 0.2) {
    out.push({
      level: 'red',
      text: `Hard training day on a ${Math.round(opts.effectiveDeficit * 100)}% deficit. Hit your protein, and consider making today a refeed day.`,
    })
  }
  return out
}

/** A recurring session, e.g. yoga Mon/Wed/Fri 12:05 for 50 minutes. */
export interface Routine {
  kind: ExerciseKind
  /** 0 = Sunday … 6 = Saturday */
  days: number[]
  start: string // HH:MM
  /** A different start on some days, e.g. { 2: '11:05' } for Tuesdays. */
  times?: Partial<Record<number, string>>
  minutes: number
  yogaStyle?: YogaStyle
}

/** When the routine starts on a given day: that day's own time, or the usual one. */
export const routineStart = (r: Routine, day = new Date()) => r.times?.[day.getDay()] ?? r.start

export const DEFAULT_YOGA_ROUTINE: Routine = { kind: 'mobility', days: [1, 3, 5], start: '12:05', minutes: 50, yogaStyle: 'flow' }

/** True when today is a routine day and that kind hasn't been logged yet today. */
export function routineDue(r: Routine, exercisesToday: Exercise[], now = new Date()): boolean {
  return r.days.includes(now.getDay()) && !exercisesToday.some((e) => e.kind === r.kind)
}

/** "StairMaster", "Running 3 mi · 9:30 /mi", "Cycling 12 mi · 14 mph", "Flow / vinyasa yoga", or the plain kind. */
export function sessionLabel(e: Exercise): string {
  const k = EXERCISE_KINDS.find((x) => x.value === e.kind)!
  if (e.kind === 'cardio' && e.meta.cardioType === 'running')
    return `${k.emoji} Running${e.meta.distanceMi ? ` ${e.meta.distanceMi} mi · ${pace(e.meta.distanceMi, e.duration_min)}` : ''}`
  if (e.kind === 'cardio' && e.meta.cardioType === 'cycling')
    return `🚴 Cycling${e.meta.distanceMi ? ` ${e.meta.distanceMi} mi · ${speed(e.meta.distanceMi, e.duration_min)}` : ''}`
  if (e.kind === 'cardio' && e.meta.cardioType === 'stairmaster')
    return `🪜 StairMaster${e.meta.level ? ` L${e.meta.level}` : ''}${e.meta.floors ? ` · ${e.meta.floors} floors` : ''}`
  if (e.kind === 'mobility' && e.meta.yogaStyle) return `${k.emoji} ${YOGA_STYLES.find((y) => y.value === e.meta.yogaStyle)!.label} yoga`
  return `${k.emoji} ${k.label}`
}

/** A ready-to-save session for a routine on the given day. */
export function routineSession(r: Routine, day = new Date()): Exercise {
  const [h, m] = routineStart(r, day).split(':').map(Number)
  const start = new Date(day)
  start.setHours(h, m, 0, 0)
  return {
    id: crypto.randomUUID(),
    started_at: start.toISOString(),
    kind: r.kind,
    duration_min: r.minutes,
    intensity: 'moderate',
    // Calories come from Fitbit's recording of the class, never an estimate.
    calories: null,
    source: 'manual',
    external_id: null,
    note: null,
    meta: { yogaStyle: r.yogaStyle, awaitingFitbit: true, tz: deviceTz() },
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
}

/** Minutes per exercise in a workout, sets and rest included. */
export const MIN_PER_EXERCISE = 6
/** A logged workout is at least this long. */
const MIN_SESSION_MIN = 10
/** Fitbit's length and the app's within this share of each other: the longer one is used without asking. */
export const DURATION_TOLERANCE = 0.1

/** How long a strength workout took, from what was logged: 6 minutes per exercise, or a cardio piece's own minutes if longer. */
export function strengthMinutes(lifts: Lift[]): number {
  let m = 0
  for (const l of lifts) m += l.measure === 'min' ? Math.max(MIN_PER_EXERCISE, (l.duration ?? 0) * (l.sets ?? 1)) : MIN_PER_EXERCISE
  return Math.max(MIN_SESSION_MIN, Math.round(m))
}

/**
 * The app's length against Fitbit's recording of a workout: 'ok' when settled, 'adjust' when they're within 10%
 * (use the longer, `use`), 'conflict' when further apart (you choose).
 */
export function durationCheck(e: Exercise): { status: 'ok' | 'adjust' | 'conflict'; app: number; fitbit: number; use: number } | null {
  const app = e.meta.appMinutes
  if (!app || !e.external_id || e.kind !== 'strength') return null
  const fitbit = e.meta.fitbitMinutes ?? e.duration_min
  const chosen = e.meta.chosenMinutes
  if (chosen != null) return { status: chosen === e.duration_min ? 'ok' : 'adjust', app, fitbit, use: chosen }
  const longer = Math.max(app, fitbit)
  if (Math.abs(app - fitbit) / longer <= DURATION_TOLERANCE) return { status: longer === e.duration_min ? 'ok' : 'adjust', app, fitbit, use: longer }
  return { status: 'conflict', app, fitbit, use: e.duration_min }
}

/** A workout set to a length, keeping Fitbit's end time and remembering Fitbit's own length. */
export function withMinutes(e: Exercise, minutes: number, chosen: boolean): Exercise {
  const fitbit = e.meta.fitbitMinutes ?? e.duration_min
  const end = Date.parse(e.started_at) + e.duration_min * 60_000
  return {
    ...e,
    started_at: new Date(end - minutes * 60_000).toISOString(),
    duration_min: minutes,
    meta: { ...e.meta, fitbitMinutes: fitbit, chosenMinutes: chosen ? minutes : e.meta.chosenMinutes },
    updated_at: new Date().toISOString(),
  }
}

/**
 * When a workout ending at `endMs` started, from heart rate: the run of raised heart rate (resting + 20) leading
 * up to the end, allowing rests between sets of up to 8 minutes. Null when the heart rate doesn't cover the end
 * (Fitbit hasn't synced it yet) or shows no workout.
 */
export function startFromHeartRate(samples: { t: number; bpm: number }[], endMs: number, restingHr: number): number | null {
  const before = samples.filter((s) => s.t <= endMs).sort((a, b) => a.t - b.t)
  if (!before.length || endMs - before[before.length - 1].t > 15 * 60_000) return null
  const raised = restingHr + 20
  const GAP = 8 * 60_000
  let start: number | null = null
  let lastHigh: number | null = null
  for (let i = before.length - 1; i >= 0; i--) {
    const s = before[i]
    if (s.bpm >= raised) {
      start = s.t
      lastHigh = s.t
    } else if (lastHigh != null && lastHigh - s.t > GAP) break
    else if (lastHigh == null && endMs - s.t > GAP) return null
  }
  if (start == null) return null
  const minutes = (endMs - start) / 60_000
  return minutes >= MIN_SESSION_MIN && minutes <= 180 ? start : null
}

/** A workout logged in the app with no Fitbit calories yet: waiting for a sync, or (after 12 hours) missing. */
export function fitbitStatus(e: Exercise, now = Date.now()): 'ok' | 'waiting' | 'missing' {
  if (e.calories != null || !e.meta.awaitingFitbit) return 'ok'
  const end = Date.parse(e.started_at) + e.duration_min * 60_000
  return now - end > 12 * 3_600_000 ? 'missing' : 'waiting'
}

/** A lift with different reps per set: its sets become the count and its reps (or time) the average, to one decimal. */
export function withSetAmounts(l: Lift, amounts: number[]): Lift {
  const done = amounts.filter((a) => Number.isFinite(a) && a > 0)
  const avg = done.length ? Math.round((done.reduce((s, a) => s + a, 0) / done.length) * 10) / 10 : null
  const timed = l.measure === 's' || l.measure === 'min'
  return { ...l, setAmounts: amounts, sets: amounts.length, ...(timed ? { duration: avg } : { reps: avg }) }
}
