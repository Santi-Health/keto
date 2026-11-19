import { entryDay } from './time'
import { liftKg, liftUnit, liftWeight, repsPerSide, type Exercise, type Lift } from './exercise'
import { findLift, groupForNew, setCredit, type LibraryExercise } from './library'

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
  /** The same sets split by how many days ago they were done (index 0 = the last day of the window). */
  byAge: number[]
  target: number
  /** Whole days since this group was last trained, or null if not in the last 3 weeks. */
  daysSince: number | null
}

export interface LiftPlan {
  name: string
  group: string
  /** Last time: weight as entered, unit, reps (total), sets. */
  last: { day: string; weight: number | null; unit: 'lb' | 'kg'; reps: number | null; sets: number | null; assisted: boolean; bells?: 2; side?: Lift['side']; measure?: Lift['measure']; duration?: number | null }
  range: [number, number]
  /** What to do next session; `reps` is seconds or minutes for timed lifts. */
  next: { weight: number | null; reps: number; change: 'reps' | 'weight' | 'hold' }
  text: string
  /** Same weight and reps for the last 3 sessions. */
  stalled: boolean
  /** Strength now against the first time you logged it. */
  sinceStart: { pct: number; since: string } | null
}

const day0 = (iso: string) => new Date(`${iso}T12:00:00`).getTime()
const daysBetween = (a: string, b: string) => Math.round((day0(b) - day0(a)) / 86_400_000)

/** Holds (hollow hold, plank) start around 20 s and top out at a minute. */
export const HOLD_START_S = 20
export const HOLD_TOP_S = 60

const COMPOUND = /press|squat|row|pull|dip|thrust|lunge|split|step-?up|deadlift|bench|chin|push-?up/i
/** Big multi-joint lifts work best at 6–10 reps; smaller and core moves at 10–15. */
export const repRange = (name: string, group: string): [number, number] =>
  group !== 'Abs / core' && group !== 'Arms' && COMPOUND.test(name) ? [6, 10] : [10, 15]

/** The muscle group of a lift: the list's, else the one you picked when adding it, else a guess from the name. */
export function groupOf(name: string, library: LibraryExercise[], picked?: string): string {
  return findLift(name, library)?.group ?? picked ?? groupForNew(name)
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

const round1 = (x: number) => Math.round(x * 10) / 10
const round2 = (x: number) => Math.round(x * 100) / 100
/** Used for assisted machines (body weight minus the assist) when your weight isn't passed in. */
export const DEFAULT_BODY_KG = 70

/** Credit for doing exactly what you did last time: steady still counts, but less. */
export const REPEAT_CREDIT = 0.9
/** …and once it's the third session in a row at the same numbers, the muscle has adapted. */
export const STALL_CREDIT = 0.8
/** Going lighter than last time counts below repeating it, whatever the reps. */
export const LIGHTER_CAP = 0.85
/** Never less than this for a set you did. */
export const MIN_EFFORT = 0.5

/** What a lift moved, in kg: the bells together, or for an assisted machine your weight minus the assist. Null for bodyweight moves. */
function loadKg(l: Lift, bodyKg: number): number | null {
  const kg = liftKg(l)
  if (kg == null || kg <= 0) return l.assisted ? bodyKg : null
  return l.assisted ? Math.max(1, bodyKg - kg) : kg * (l.bells ?? 1)
}

/** Reps a side (or seconds/minutes for timed pieces): what the set did besides its load. */
const amountOf = (l: Lift) => (l.measure === 's' || l.measure === 'min' ? l.duration ?? null : repsPerSide(l))

const sameNumbers = (a: Lift, b: Lift, bodyKg: number) =>
  Math.abs((loadKg(a, bodyKg) ?? 0) - (loadKg(b, bodyKg) ?? 0)) < 0.01 && amountOf(a) === amountOf(b)

/** Strength from one set (Epley one-rep max), for "progress since your start". */
const strengthOf = (l: Lift, bodyKg: number) => {
  const load = loadKg(l, bodyKg)
  const a = amountOf(l)
  if (a == null) return null
  return load == null || l.measure === 's' || l.measure === 'min' ? a : load * (1 + a / 30)
}

/**
 * How this lift compares with the same exercise last time (0.5 to 1): 1 when it got a bit harder (more reps, a
 * longer hold, or the planned step up in weight reaching the bottom of the rep range); 0.9 for exactly the same
 * numbers, 0.8 once that's three sessions running; less when it was easier than last time. The first time sets
 * your starting point and counts in full.
 */
export function progressionScore(l: Lift, prev: Lift[], library: LibraryExercise[], bodyKg = DEFAULT_BODY_KG): { effort: number; why: string } {
  const last = prev[prev.length - 1]
  if (!last) return { effort: 1, why: 'first time: sets your starting point' }
  if (sameNumbers(l, last, bodyKg)) {
    const stalled = prev.length >= 2 && sameNumbers(l, prev[prev.length - 2], bodyKg)
    return stalled ? { effort: STALL_CREDIT, why: 'same as the last 2 sessions' } : { effort: REPEAT_CREDIT, why: 'same as last time' }
  }
  const a = amountOf(l)
  const la = amountOf(last)
  const unit = l.measure === 's' ? 's' : l.measure === 'min' ? 'min' : 'reps'
  if (a == null || la == null) return { effort: 1, why: 'new numbers' }
  const w = loadKg(l, bodyKg)
  const lw = loadKg(last, bodyKg)
  if (w == null || lw == null || l.measure === 's' || l.measure === 'min') {
    return a > la ? { effort: 1, why: `more than last time (${la} ${unit})` } : { effort: Math.max(MIN_EFFORT, round2(a / la)), why: `${a} vs ${la} ${unit} last time` }
  }
  if (w > lw + 0.01) {
    const lo = repRange(l.name, groupOf(l.name, library, l.group))[0]
    return a >= lo ? { effort: 1, why: 'heavier than last time' } : { effort: Math.max(MIN_EFFORT, round2(a / lo)), why: `heavier, but ${a} of the ${lo} reps to aim for` }
  }
  if (Math.abs(w - lw) <= 0.01) {
    return a > la ? { effort: 1, why: `more reps than last time (${la})` } : { effort: Math.max(MIN_EFFORT, round2(a / la)), why: `${a} vs ${la} reps last time` }
  }
  // Lighter: what the set did against last time's, and never full credit.
  return { effort: Math.min(LIGHTER_CAP, Math.max(MIN_EFFORT, round2((w * a) / (lw * la)))), why: 'lighter than last time' }
}

export interface ScoredLift extends Done {
  /** The exercise's tier credit, the progression score, and what one set counts (their product). */
  tier: number
  effort: number
  perSet: number
  why: string
}

/** Every lift you've logged, oldest first, each scored against the same exercise before it. */
export function scoreLifts(exercises: Exercise[], library: LibraryExercise[], bodyKg = DEFAULT_BODY_KG): ScoredLift[] {
  const history = new Map<string, Lift[]>()
  return liftsSince(exercises, '0000-01-01').map((d) => {
    const k = d.lift.name.trim().toLowerCase()
    const prev = history.get(k) ?? []
    const p = progressionScore(d.lift, prev, library, bodyKg)
    history.set(k, [...prev, d.lift])
    const tier = setCredit(d.lift.name, library)
    return { ...d, tier, effort: p.effort, perSet: round2(tier * p.effort), why: p.why }
  })
}

/**
 * What each set of a lift you're logging counts toward its group: tier × how it compares with the last time you
 * did it (before the session being edited, `excludeId`).
 */
export function scoreLiftDraft(l: Lift, exercises: Exercise[], library: LibraryExercise[], excludeId?: string, bodyKg = DEFAULT_BODY_KG) {
  const k = l.name.trim().toLowerCase()
  if (!k) return null
  const prev = liftsSince(exercises.filter((e) => e.id !== excludeId), '0000-01-01')
    .filter((d) => d.lift.name.trim().toLowerCase() === k)
    .map((d) => d.lift)
  const tier = setCredit(l.name, library)
  const p = progressionScore(l, prev, library, bodyKg)
  return { tier, effort: p.effort, perSet: round2(tier * p.effort), why: p.why, group: groupOf(l.name, library, l.group) }
}

/** How much stronger you are at an exercise than the first time you logged it, from your best set each time. */
export function progressSinceStart(history: Lift[], days: string[], bodyKg = DEFAULT_BODY_KG): { pct: number; since: string } | null {
  if (history.length < 2) return null
  const first = strengthOf(history[0], bodyKg)
  const now = strengthOf(history[history.length - 1], bodyKg)
  if (!first || now == null) return null
  return { pct: Math.round((now / first - 1) * 100), since: days[0] }
}

const shift = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Monday of the week a day falls in (weeks run Monday to Sunday). */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T12:00:00`).getDay()
  return shift(day, -((dow + 6) % 7))
}

/** Days left in the Monday–Sunday week after `day` (0 on Sunday). */
export const daysLeftInWeek = (day: string) => 6 - daysBetween(weekStart(day), day)

/** How much of a lift's sets count toward a group: all for its own group, a share for a second one it also trains. */
export function groupShare(l: Pick<Lift, 'name' | 'group'>, group: string, library: LibraryExercise[]): number {
  if (groupOf(l.name, library, l.group) === group) return 1
  const also = findLift(l.name, library)?.also
  return also?.group === group ? also.share : 0
}

/**
 * Sets per muscle group from `from` (default: the rolling 7 days ending today) through `today`, and days since
 * each was last trained. Past weeks are judged on fixed Monday–Sunday weeks instead (see pastWeeks).
 */
export function weekCoverage(exercises: Exercise[], library: LibraryExercise[], today: string, from?: string, bodyKg = DEFAULT_BODY_KG): GroupWeek[] {
  const recentFrom = shift(today, -20)
  const recent = scoreLifts(exercises, library, bodyKg).filter((d) => d.day >= recentFrom)
  const weekFrom = from ?? shift(today, -6)
  return Object.entries(WEEKLY_SETS).map(([group, target]) => {
    const mine = recent.filter((d) => groupShare(d.lift, group, library) > 0)
    // Effective sets: each set counts its exercise's tier times how it compared with last time (and its share, for a
    // second group it also trains).
    const inWindow = mine.filter((d) => d.day >= weekFrom && d.day <= today)
    const count = (d: ScoredLift) => (d.lift.sets ?? 1) * d.perSet * groupShare(d.lift, group, library)
    const sets = round1(inWindow.reduce((s, d) => s + count(d), 0))
    const byAge = Array.from({ length: daysBetween(weekFrom, today) + 1 }, () => 0)
    for (const d of inWindow) byAge[daysBetween(d.day, today)] += count(d)
    const last = mine.length ? mine[mine.length - 1].day : null
    return { group, sets, target, byAge: byAge.map(round1), daysSince: last ? daysBetween(last, today) : null }
  })
}

export type WeekVerdict = 'good' | 'close' | 'behind'

export interface PastWeek {
  /** Monday and Sunday of the week. */
  start: string
  end: string
  coverage: GroupWeek[]
  groupsMet: number
  groups: number
  sets: number
  targetSets: number
  /** Good: every group hit its sets. Close: 5+ of 7 groups, or 80% of all sets. Behind: less. */
  verdict: WeekVerdict
}

/** A finished (or current) Monday–Sunday week, judged on its sets. */
export function judgeWeek(coverage: GroupWeek[], start: string): PastWeek {
  const groupsMet = coverage.filter((g) => g.sets >= g.target).length
  const sets = round1(coverage.reduce((a, g) => a + Math.min(g.sets, g.target), 0))
  const targetSets = coverage.reduce((a, g) => a + g.target, 0)
  const verdict: WeekVerdict = groupsMet === coverage.length ? 'good' : groupsMet >= coverage.length - 2 || sets >= targetSets * 0.8 ? 'close' : 'behind'
  return { start, end: shift(start, 6), coverage, groupsMet, groups: coverage.length, sets, targetSets, verdict }
}

/** Up to `n` full weeks before this one, newest first, starting no earlier than the week of your first logged lift. */
export function pastWeeks(exercises: Exercise[], library: LibraryExercise[], today: string, n = 6, bodyKg = DEFAULT_BODY_KG): PastWeek[] {
  const first = liftsSince(exercises, '0000-01-01')[0]?.day
  if (!first) return []
  return Array.from({ length: n }, (_, i) => shift(weekStart(today), -7 * (i + 1)))
    .filter((start) => shift(start, 6) >= first)
    .map((start) => judgeWeek(weekCoverage(exercises, library, shift(start, 6), start, bodyKg), start))
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
  // Full history per lift (for progress since your start), listing only lifts done in the last 3 weeks.
  const recent = liftsSince(exercises, '0000-01-01')
  const byName = new Map<string, Done[]>()
  for (const d of recent) {
    const k = d.lift.name.trim().toLowerCase()
    byName.set(k, [...(byName.get(k) ?? []), d])
  }
  const from = shift(today, -20)
  return [...byName.values()].filter((h) => h[h.length - 1].day >= from).map((history) => planFromHistory(history, library))
}

/** The next session for one lift from its history (oldest first). */
function planFromHistory(history: Done[], library: LibraryExercise[]): LiftPlan {
  {
    const { day, lift } = history[history.length - 1]
    const group = groupOf(lift.name, library, lift.group)
    const range = repRange(lift.name, group)
    const [lo, hi] = range
    const weight = liftWeight(lift)
    const unit = liftUnit(lift)
    const per = repsPerSide(lift) ?? 0
    // Reps are logged as the total; alternating sides splits them, so the range applies per side.
    // Two bells moved together count every rep for both arms.
    const perSide = lift.side === 'both'
    const total = (r: number) => (perSide ? r * 2 : r)
    const repWord = perSide ? ' a side' : ''
    let next: LiftPlan['next']
    let text: string
    const loaded = weight != null && weight > 0
    const t = lift.duration ?? 0
    if (lift.measure === 'min') {
      // Cardio inside a strength session: a little longer or a level harder each time.
      const level = loaded ? ` at level ${weight}` : ''
      next = { weight: loaded ? weight! + 1 : weight, reps: t, change: loaded ? 'weight' : 'reps' }
      text = loaded ? `Last ${t} min${level}. Next: same ${t} min at level ${weight! + 1}, or 2 more minutes.` : `Last ${t} min. Next: 2 more minutes, or log the level to track it.`
    } else if (lift.measure === 's') {
      // Holds: build to a minute, then make it harder rather than longer.
      if (t >= HOLD_TOP_S) {
        next = { weight, reps: t, change: 'hold' }
        text = `${t} s is long enough: make it harder (hold a plate, longer lever) instead of longer.`
      } else {
        const aim = Math.min(HOLD_TOP_S, Math.max(HOLD_START_S, Math.ceil((t + 5) / 5) * 5))
        next = { weight, reps: aim, change: 'reps' }
        text = `Aim for ${aim} s a set. At ${HOLD_TOP_S} s, make it harder instead of longer.`
      }
    } else if (per >= hi && loaded) {
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
    const stalled =
      last3.length === 3 && lift.measure !== 'min' && last3.every((d) => liftWeight(d.lift) === weight && d.lift.reps === lift.reps && (d.lift.duration ?? null) === (lift.duration ?? null))
    return {
      name: lift.name,
      group,
      last: { day, weight, unit, reps: lift.reps, sets: lift.sets, assisted: !!lift.assisted, bells: lift.bells, side: lift.side, measure: lift.measure, duration: lift.duration },
      range,
      next,
      text,
      stalled,
      sinceStart: progressSinceStart(history.map((d) => d.lift), history.map((d) => d.day)),
    }
  }
}

export interface LiftSuggestion {
  /** The last time you did it. */
  last: LiftPlan['last']
  /** Numbers to start this time from: the progression's next step, or the same as last time. */
  fill: Partial<Lift>
  /** Change from last time, for weight and for reps (or seconds/minutes). */
  delta: { weight: number; amount: number }
  text: string
}

/**
 * What to put in a lift you're logging, from the last time you did it (any time, not counting `excludeId`, the
 * session being edited): the progression's next numbers and how they differ. Null when you've never done it.
 */
export function suggestFromHistory(name: string, exercises: Exercise[], library: LibraryExercise[], excludeId?: string): LiftSuggestion | null {
  const k = name.trim().toLowerCase()
  if (!k) return null
  const history = liftsSince(
    exercises.filter((e) => e.id !== excludeId),
    '0000-01-01',
  ).filter((d) => d.lift.name.trim().toLowerCase() === k)
  if (!history.length) return null
  const p = planFromHistory(history, library)
  const l = p.last
  const timed = l.measure === 's' || l.measure === 'min'
  const amountWas = (timed ? l.duration : l.reps) ?? null
  const fill: Partial<Lift> = {
    measure: l.measure,
    weight: p.next.weight,
    weightLb: null,
    unit: l.unit,
    sets: l.sets,
    assisted: l.assisted,
    bells: l.bells,
    side: l.side,
    ...(timed ? { duration: p.next.reps || amountWas, reps: null } : { reps: p.next.reps || amountWas }),
  }
  return {
    last: l,
    fill,
    delta: {
      weight: p.next.weight != null && l.weight != null ? Math.round((p.next.weight - l.weight) * 100) / 100 : 0,
      amount: amountWas != null && p.next.reps ? p.next.reps - amountWas : 0,
    },
    text: p.text,
  }
}

/** Minutes of cardio inside a strength session that count as a hard effort for VO2 max. */
export const CARDIO_IN_LIFT_MIN = 10

/**
 * Hard cardio in the 7 days ending today, for VO2 max: hard cardio sessions, plus strength sessions with
 * 10+ minutes of StairMaster, rowing or similar logged as a lift.
 */
export function hardCardioThisWeek(exercises: Exercise[], today: string): number {
  const from = shift(today, -6)
  return exercises.filter((e) => {
    if (e.deleted_at || entryDay(e.started_at, e.meta.tz) < from) return false
    if (e.kind === 'cardio') return e.intensity === 'high'
    return e.kind === 'strength' && (e.meta.lifts ?? []).some((l) => l.measure === 'min' && (l.duration ?? 0) * (l.sets ?? 1) >= CARDIO_IN_LIFT_MIN)
  }).length
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

export interface ExercisePick {
  name: string
  /** What one set counts toward the group (its tier). */
  credit: number
  /** Times logged in the last 90 days (0 = new to you). */
  times: number
  lastDay: string | null
  /** At the gym you used most recently (or anywhere). */
  atYourGym: boolean
}

/** The gym of your most recent lift that named one. */
export function lastGym(exercises: Exercise[]): Lift['gym'] {
  const lifts = exercises
    .filter((e) => !e.deleted_at && e.kind === 'strength')
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .flatMap((e) => e.meta.lifts ?? [])
  return lifts.find((l) => l.gym)?.gym
}

/**
 * Exercises for a muscle group, best first: ones you've done (most often, then most recently), then ones at
 * your usual gym, then the rest of the list. Anything you marked "not for me" is left out.
 */
export function exercisesFor(
  group: string,
  opts: { exercises: Exercise[]; library: LibraryExercise[]; today: string; disliked?: string[]; gym?: Lift['gym']; n?: number },
): ExercisePick[] {
  const { exercises, library, today, disliked = [], n = 2 } = opts
  const gym = opts.gym ?? lastGym(exercises)
  const no = new Set(disliked.map((d) => d.trim().toLowerCase()))
  const history = liftsSince(exercises, shift(today, -89))
  const picks = new Map<string, ExercisePick>()
  for (const d of history) {
    if (groupOf(d.lift.name, library, d.lift.group) !== group) continue
    const k = d.lift.name.trim().toLowerCase()
    const p = picks.get(k) ?? { name: d.lift.name.trim(), credit: setCredit(d.lift.name, library), times: 0, lastDay: null, atYourGym: true }
    picks.set(k, { ...p, times: p.times + 1, lastDay: d.day })
  }
  for (const e of library) {
    const k = e.name.toLowerCase()
    if (e.group !== group || picks.has(k)) continue
    picks.set(k, { name: e.name, credit: setCredit(e.name, library), times: 0, lastDay: null, atYourGym: !gym || e.gyms.includes('any') || e.gyms.includes(gym) })
  }
  return [...picks.entries()]
    .filter(([k, p]) => !no.has(k) && p.credit > 0)
    .map(([, p]) => p)
    // The most effective first, then ones you've done (most often, most recently), then at your gym.
    .sort((a, b) => b.credit - a.credit || Math.sign(b.times) - Math.sign(a.times) || b.times - a.times || (b.lastDay ?? '').localeCompare(a.lastDay ?? '') || Number(b.atYourGym) - Number(a.atYourGym))
    .slice(0, n)
}
