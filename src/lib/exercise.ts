export type ExerciseKind = 'strength' | 'cardio' | 'hiit' | 'walking' | 'sport' | 'mobility' | 'other'
export type Intensity = 'low' | 'moderate' | 'high'

export const EXERCISE_KINDS: { value: ExerciseKind; label: string; emoji: string }[] = [
  { value: 'strength', label: 'Strength', emoji: '🏋️' },
  { value: 'cardio', label: 'Cardio', emoji: '🏃' },
  { value: 'hiit', label: 'HIIT', emoji: '⚡' },
  { value: 'walking', label: 'Walking', emoji: '🚶' },
  { value: 'sport', label: 'Sport', emoji: '🎾' },
  { value: 'mobility', label: 'Yoga / mobility', emoji: '🧘' },
  { value: 'other', label: 'Other', emoji: '✳️' },
]

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
export function estimateExerciseKcal(kind: ExerciseKind, intensity: Intensity, minutes: number, weightKg: number): number {
  return Math.round((METS[kind][intensity] - 1) * weightKg * (minutes / 60))
}

export interface Lift {
  name: string
  weightLb: number | null
  reps: number | null
  sets: number | null
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
  meta: {
    fasted?: boolean
    lifts?: Lift[]
    caloriesEstimated?: boolean
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
