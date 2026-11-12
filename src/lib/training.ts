import { entryDay } from './time'
import { liftUnit, liftWeight, repsPerSide, type Exercise, type Lift } from './exercise'
import { findLift, groupForNew, type LibraryExercise } from './library'

/**
 * What the last week of lifting covered and what each lift should do next.
 * About 10 hard sets per muscle a week keeps muscle while losing fat; chest and abs get more because
 * defining them is a goal. No fixed schedule: whatever the week is short on comes next.
 */
export const WEEKLY_SETS: Record<string, number> = {
  Chest: 12,
  'Abs / core': 12,
  Back: 10,
  Legs: 10,
  'Hamstrings / glutes': 6,
  Shoulders: 6,
  Arms: 6,
}

/** Groups that serve the abs-and-chest goal get a nudge when ranking what's due. */
const SHOW_GROUPS = new Set(['Chest', 'Abs / core'])

export interface GroupWeek {
  group: string
  sets: number
  target: number
  /** Whole days since this group was last trained, or null if not in the last 3 weeks. */
  daysSince: number | null
}

export interface LiftPlan {
  name: string
  group: string
  /** Last time: weight as entered, unit, reps (total), sets. */
  last: { day: string; weight: number | null; unit: 'lb' | 'kg'; reps: number | null; sets: number | null; assisted: boolean; bells?: 2; side?: Lift['side'] }
  range: [number, number]
  /** What to do next session. */
  next: { weight: number | null; reps: number; change: 'reps' | 'weight' | 'hold' }
  text: string
  /** Same weight and reps for the last 3 sessions. */
  stalled: boolean
}

const day0 = (iso: string) => new Date(`${iso}T12:00:00`).getTime()
const daysBetween = (a: string, b: string) => Math.round((day0(b) - day0(a)) / 86_400_000)

const COMPOUND = /press|squat|row|pull|dip|thrust|lunge|split|step-?up|deadlift|bench|chin|push-?up/i
/** Big multi-joint lifts work best at 6–10 reps; smaller and core moves at 10–15. */
export const repRange = (name: string, group: string): [number, number] =>
  group !== 'Abs / core' && group !== 'Arms' && COMPOUND.test(name) ? [6, 10] : [10, 15]

export function groupOf(name: string, library: LibraryExercise[]): string {
  return findLift(name, library)?.group ?? groupForNew(name)
}

/** The next weight up: 5 lb, one kettlebell size (4 kg) or 2.5 kg; on an assisted machine, 5 lb less help. */
export function nextWeight(l: Pick<Lift, 'name' | 'assisted' | 'bells'> & { weight: number; unit: 'lb' | 'kg' }): number {
  const kb = /kettlebell|\bkb\b/i.test(l.name) || l.bells === 2
  const step = l.unit === 'lb' ? 5 : kb ? 4 : 2.5
  return l.assisted ? Math.max(0, l.weight - step) : l.weight + step
}

interface Done {
  day: string
  lift: Lift
}

function liftsSince(exercises: Exercise[], from: string): Done[] {
  return exercises
    .filter((e) => !e.deleted_at && e.kind === 'strength' && e.meta.lifts?.length)
    .map((e) => ({ day: entryDay(e.started_at, e.meta.tz), e }))
    .filter((x) => x.day >= from)
    .sort((a, b) => a.e.started_at.localeCompare(b.e.started_at))
    .flatMap((x) => x.e.meta.lifts!.filter((l) => l.name.trim()).map((lift) => ({ day: x.day, lift })))
}

const shift = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Sets per muscle group over the 7 days ending today, and days since each was last trained. */
export function weekCoverage(exercises: Exercise[], library: LibraryExercise[], today: string): GroupWeek[] {
  const recent = liftsSince(exercises, shift(today, -20))
  const weekFrom = shift(today, -6)
  return Object.entries(WEEKLY_SETS).map(([group, target]) => {
    const mine = recent.filter((d) => groupOf(d.lift.name, library) === group)
    const sets = mine.filter((d) => d.day >= weekFrom).reduce((s, d) => s + (d.lift.sets ?? 1), 0)
    const last = mine.length ? mine[mine.length - 1].day : null
    return { group, sets, target, daysSince: last ? daysBetween(last, today) : null }
  })
}

/**
 * Groups to train next, most needed first: furthest below their weekly sets, chest and abs a little ahead,
 * and nothing trained yesterday (muscle grows while it recovers).
 */
export function groupsDue(weeks: GroupWeek[]): GroupWeek[] {
  const need = (g: GroupWeek) => (1 - Math.min(1, g.sets / g.target)) * (SHOW_GROUPS.has(g.group) ? 1.25 : 1)
  return weeks
    .filter((g) => g.sets < g.target && (g.daysSince == null || g.daysSince >= 2))
    .sort((a, b) => need(b) - need(a))
}

/** The next session for each lift done in the last 3 weeks, using its most recent numbers. */
export function liftPlans(exercises: Exercise[], library: LibraryExercise[], today: string): LiftPlan[] {
  const recent = liftsSince(exercises, shift(today, -20))
  const byName = new Map<string, Done[]>()
  for (const d of recent) {
    const k = d.lift.name.trim().toLowerCase()
    byName.set(k, [...(byName.get(k) ?? []), d])
  }
  return [...byName.values()].map((history) => {
    const { day, lift } = history[history.length - 1]
    const group = groupOf(lift.name, library)
    const range = repRange(lift.name, group)
    const [lo, hi] = range
    const weight = liftWeight(lift)
    const unit = liftUnit(lift)
    const per = repsPerSide(lift) ?? 0
    // Reps are logged as the total; with two bells or both sides, the range applies per side.
    const perSide = lift.bells === 2 || lift.side === 'both'
    const total = (r: number) => (perSide ? r * 2 : r)
    const repWord = perSide ? ' a side' : ''
    let next: LiftPlan['next']
    let text: string
    const loaded = weight != null && weight > 0
    if (per >= hi && loaded) {
      const w = nextWeight({ name: lift.name, assisted: lift.assisted, bells: lift.bells, weight: weight!, unit })
      next = { weight: w, reps: total(lo), change: 'weight' }
      text = `${lift.assisted ? `Take ${Math.abs(weight! - w)} ${unit} less assist` : `Go up to ${w} ${unit}${lift.bells === 2 ? ' a bell' : ''}`} and drop to ${lo} reps${repWord}; build back up from there.`
    } else if (per >= hi) {
      next = { weight, reps: total(hi), change: 'hold' }
      text = `${hi}+ reps${repWord} is the top of the range: add weight (hold a plate or med ball) or a harder version.`
    } else if (per < lo && loaded) {
      next = { weight, reps: total(lo), change: 'reps' }
      text = `Stay at ${weight} ${unit} and build to ${lo} reps${repWord}${lift.assisted ? ' (or add a little assist)' : ''}.`
    } else {
      const aim = Math.min(hi, Math.max(lo, Math.floor(per) + 1))
      next = { weight, reps: total(aim), change: 'reps' }
      text = loaded ? `Same ${weight} ${unit}, aim for ${aim} reps${repWord}. At ${hi} on every set, add weight.` : `Aim for ${aim} reps${repWord}.`
    }
    const last3 = history.slice(-3)
    const stalled = last3.length === 3 && last3.every((d) => liftWeight(d.lift) === weight && d.lift.reps === lift.reps)
    return {
      name: lift.name,
      group,
      last: { day, weight, unit, reps: lift.reps, sets: lift.sets, assisted: !!lift.assisted, bells: lift.bells, side: lift.side },
      range,
      next,
      text,
      stalled,
    }
  })
}

/** Hard cardio (intervals, StairMaster, runs) in the 7 days ending today, for VO2 max. */
export function hardCardioThisWeek(exercises: Exercise[], today: string): number {
  const from = shift(today, -6)
  return exercises.filter((e) => !e.deleted_at && e.kind === 'cardio' && e.intensity === 'high' && entryDay(e.started_at, e.meta.tz) >= from).length
}

/** Lifting days in a row up to today (0 if not today). */
export function liftStreak(exercises: Exercise[], today: string): number {
  const days = new Set(exercises.filter((e) => !e.deleted_at && e.kind === 'strength').map((e) => entryDay(e.started_at, e.meta.tz)))
  let n = 0
  while (days.has(shift(today, -n))) n++
  return n
}

/** Days with strength training in the 7 days ending today. */
export function liftDaysThisWeek(exercises: Exercise[], today: string): number {
  const from = shift(today, -6)
  return new Set(exercises.filter((e) => !e.deleted_at && e.kind === 'strength').map((e) => entryDay(e.started_at, e.meta.tz)).filter((d) => d >= from && d <= today)).size
}
