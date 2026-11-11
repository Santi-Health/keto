import type { ActivityDay } from './activity'
import type { Exercise } from './exercise'
import type { LogEntry } from './foods'

/** Everyday life on top of resting burn (digestion, standing, moving around): the sedentary factor. */
export const BASELINE_FACTOR = 1.2

export interface DeficitPoint {
  /** Hour of the day, 0–23; the point is the running total at the end of that hour (or now). */
  hour: number
  burned: number
  eaten: number
  deficit: number
}

export interface DeficitSoFar {
  burned: number
  eaten: number
  /** Burned minus eaten; positive is a deficit. */
  deficit: number
  /** Where the burn came from: Fitbit's total for the day up to the last import, or the estimate. */
  burnSource: 'fitbit' | 'estimate'
  /** When Fitbit's number was imported, when it's used. */
  fitbitAt: Date | null
  /** What the burn so far is made of: resting (being alive), everyday movement, and each workout. */
  parts: { resting: number; movement: number; workouts: { exercise: Exercise; kcal: number }[] }
  /** Deficit by midnight if nothing more is eaten and no more workouts happen. */
  byMidnight: number
  hours: DeficitPoint[]
}

const minutesBetween = (a: number, b: number) => Math.max(0, (b - a) / 60_000)

/** Active calories of a workout done between two times, spread evenly over its minutes. */
function workoutKcalBetween(e: Exercise, from: number, to: number): number {
  const start = Date.parse(e.started_at)
  const end = start + e.duration_min * 60_000
  const overlap = minutesBetween(Math.max(start, from), Math.min(end, to))
  return e.duration_min > 0 ? ((e.calories ?? 0) * overlap) / e.duration_min : 0
}

/**
 * Calorie deficit for today up to `now`, hour by hour.
 * Burn = resting burn × the everyday factor for the time passed, plus workouts done so far.
 * When Fitbit's total for today was imported, it replaces everything up to that moment
 * (it already includes workouts and real movement), and the estimate carries on from there.
 */
export function deficitSoFar(opts: {
  day: string
  now: Date
  bmr: number
  logs: Pick<LogEntry, 'eaten_at' | 'nutrients'>[]
  exercises: Exercise[]
  activity?: Pick<ActivityDay, 'calories_out' | 'updated_at'> | null
}): DeficitSoFar {
  const { day, now, bmr, logs, exercises, activity } = opts
  const midnight = new Date(`${day}T00:00:00`).getTime()
  const endOfDay = midnight + 86_400_000
  const nowMs = Math.min(now.getTime(), endOfDay)
  const perMin = (bmr * BASELINE_FACTOR) / 1440
  const live = exercises.filter((e) => !e.deleted_at)

  // Fitbit's day total counts only when it was read today, after midnight, and isn't in the future.
  const fitbitAtMs = activity?.calories_out != null ? Date.parse(activity.updated_at) : NaN
  const useFitbit = Number.isFinite(fitbitAtMs) && fitbitAtMs > midnight && fitbitAtMs <= nowMs
  const fitbitKcal = useFitbit ? activity!.calories_out! : 0
  const estimateUntil = (from: number, to: number) =>
    perMin * minutesBetween(from, to) + live.reduce((s, e) => s + workoutKcalBetween(e, from, to), 0)
  // Fitbit's total is spread over the hours before the import in proportion to the estimate, so the curve keeps its shape.
  const estAtImport = useFitbit ? estimateUntil(midnight, fitbitAtMs) : 0
  const burnedAt = (t: number): number => {
    if (!useFitbit) return estimateUntil(midnight, t)
    if (t <= fitbitAtMs) return estAtImport > 0 ? (fitbitKcal * estimateUntil(midnight, t)) / estAtImport : 0
    return fitbitKcal + estimateUntil(fitbitAtMs, t)
  }
  const eatenAt = (t: number) => logs.reduce((s, l) => s + (Date.parse(l.eaten_at) <= t ? l.nutrients.kcal ?? 0 : 0), 0)

  const hours: DeficitPoint[] = []
  for (let h = 0; midnight + h * 3_600_000 < nowMs; h++) {
    const t = Math.min(midnight + (h + 1) * 3_600_000, nowMs)
    const burned = Math.round(burnedAt(t))
    const eaten = Math.round(eatenAt(t))
    hours.push({ hour: h, burned, eaten, deficit: burned - eaten })
  }
  const burned = Math.round(burnedAt(nowMs))
  // Everything logged for the day counts, even if its time is set later than now.
  const eaten = Math.round(logs.reduce((s, l) => s + (l.nutrients.kcal ?? 0), 0))
  // Resting is the body's own burn (BMR) for the time passed; workouts as done so far; movement is the rest
  // (the everyday allowance, or with Fitbit whatever its total holds beyond resting and workouts).
  const elapsed = minutesBetween(midnight, nowMs)
  const resting = Math.round((bmr / 1440) * elapsed)
  const workouts = live
    .map((exercise) => ({ exercise, kcal: Math.round(workoutKcalBetween(exercise, midnight, nowMs)) }))
    .filter((w) => w.kcal > 0)
    .sort((a, b) => a.exercise.started_at.localeCompare(b.exercise.started_at))
  const movement = burned - resting - workouts.reduce((s, w) => s + w.kcal, 0)
  return {
    burned,
    eaten,
    parts: { resting, movement, workouts },
    deficit: burned - eaten,
    burnSource: useFitbit ? 'fitbit' : 'estimate',
    fitbitAt: useFitbit ? new Date(fitbitAtMs) : null,
    byMidnight: Math.round(burned + perMin * minutesBetween(nowMs, endOfDay) - eaten),
    hours,
  }
}

export interface DayEnergy {
  day: string
  burned: number
  eaten: number
  /** Burned minus eaten; positive is a deficit. */
  deficit: number
  burnSource: 'fitbit' | 'estimate'
  /** Food was logged that day, so the deficit means something. */
  logged: boolean
}

/**
 * A finished day's calories burned and eaten. Fitbit's total counts in full when it was imported after the day
 * ended; one imported during the day is topped up with the estimate for the rest of it, like the live view.
 */
export function dayEnergy(opts: {
  day: string
  bmr: number
  logs: Pick<LogEntry, 'eaten_at' | 'nutrients'>[]
  exercises: Exercise[]
  activity?: Pick<ActivityDay, 'calories_out' | 'updated_at'> | null
}): DayEnergy {
  const { day, activity } = opts
  const end = new Date(`${day}T00:00:00`).getTime() + 86_400_000
  const eaten = Math.round(opts.logs.reduce((s, l) => s + (l.nutrients.kcal ?? 0), 0))
  const logged = opts.logs.length > 0
  const out = activity?.calories_out
  if (out != null && out > 0 && Date.parse(activity!.updated_at) >= end) {
    return { day, burned: Math.round(out), eaten, deficit: Math.round(out) - eaten, burnSource: 'fitbit', logged }
  }
  const d = deficitSoFar({ ...opts, now: new Date(end) })
  return { day, burned: d.burned, eaten, deficit: d.burned - eaten, burnSource: d.burnSource, logged }
}
