import type { Reading } from './cgm'
import type { Exercise } from './exercise'
import type { LogEntry } from './foods'

/** Target range for someone with prediabetes aiming for steady glucose (mg/dL). */
export const RANGE = { low: 70, high: 140 }

const MIN = 60_000

export interface GlucoseSummary {
  count: number
  avg: number
  min: number
  max: number
  sd: number
  /** Coefficient of variation, %. Under ~20% is steady. */
  cv: number
  inRangePct: number
  abovePct: number
  belowPct: number
  /** Average between 3 and 6 AM: the closest thing to a fasting value. */
  overnight: number | null
}

export function summarize(rs: Reading[]): GlucoseSummary | null {
  if (!rs.length) return null
  const vs = rs.map((r) => r.v)
  const avg = vs.reduce((a, b) => a + b, 0) / vs.length
  const sd = Math.sqrt(vs.reduce((a, b) => a + (b - avg) ** 2, 0) / vs.length)
  const night = rs.filter((r) => {
    const h = new Date(r.t).getHours()
    return h >= 3 && h < 6
  })
  const pct = (f: (v: number) => boolean) => Math.round((vs.filter(f).length / vs.length) * 100)
  return {
    count: vs.length,
    avg: Math.round(avg),
    min: Math.min(...vs),
    max: Math.max(...vs),
    sd: Math.round(sd),
    cv: Math.round((sd / avg) * 100),
    inRangePct: pct((v) => v >= RANGE.low && v <= RANGE.high),
    abovePct: pct((v) => v > RANGE.high),
    belowPct: pct((v) => v < RANGE.low),
    overnight: night.length ? Math.round(night.reduce((a, r) => a + r.v, 0) / night.length) : null,
  }
}

const between = (rs: Reading[], from: number, to: number) => rs.filter((r) => r.t >= from && r.t <= to)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN
}

export type ResponseLevel = 'steady' | 'moderate' | 'spike'

export interface MealResponse {
  start: number
  meal: LogEntry['meal']
  foods: string[]
  netCarbs: number
  protein: number
  baseline: number
  peak: number
  rise: number
  minutesToPeak: number
  level: ResponseLevel
  /** Back within 10 mg/dL of baseline by this many minutes, if it got there within 3 hours. */
  recoveredAfter: number | null
  /** A workout started during the window, so it was cut short there. */
  cutByExercise: boolean
}

export const levelFor = (rise: number): ResponseLevel => (rise < 20 ? 'steady' : rise < 40 ? 'moderate' : 'spike')

/** Groups food logged within 30 minutes into one eating event. */
export function eatingEvents(logs: LogEntry[]): LogEntry[][] {
  const sorted = [...logs].sort((a, b) => a.eaten_at.localeCompare(b.eaten_at))
  const events: LogEntry[][] = []
  for (const l of sorted) {
    const last = events[events.length - 1]
    if (last && Date.parse(l.eaten_at) - Date.parse(last[0].eaten_at) <= 30 * MIN) last.push(l)
    else events.push([l])
  }
  return events
}

/**
 * How glucose responded in the 2½ hours after each eating event. If a workout starts in that
 * window, the window stops there so the workout's own effect isn't blamed on the food.
 */
export function mealResponses(logs: LogEntry[], rs: Reading[], exercises: Exercise[] = []): MealResponse[] {
  const out: MealResponse[] = []
  for (const ev of eatingEvents(logs)) {
    const start = Date.parse(ev[0].eaten_at)
    const workout = exercises
      .map((e) => Date.parse(e.started_at))
      .filter((t) => t > start && t < start + 150 * MIN)
      .sort((a, b) => a - b)[0]
    if (workout != null && workout - start < 40 * MIN) continue // too short to judge the food alone
    const end = workout ?? start + 150 * MIN
    const before = between(rs, start - 30 * MIN, start + 5 * MIN)
    const after = between(rs, start, end)
    if (before.length < 2 || after.length < 6) continue
    const baseline = Math.round(median(before.map((r) => r.v)))
    const peakR = after.reduce((m, r) => (r.v > m.v ? r : m), after[0])
    const rise = Math.max(0, peakR.v - baseline)
    const back = between(rs, peakR.t, Math.min(end, start + 180 * MIN)).find((r) => r.v <= baseline + 10)
    out.push({
      start,
      meal: ev[0].meal,
      foods: ev.map((l) => l.food_name),
      netCarbs: ev.reduce((s, l) => s + (l.nutrients.netCarbs ?? 0), 0),
      protein: ev.reduce((s, l) => s + (l.nutrients.protein ?? 0), 0),
      baseline,
      peak: peakR.v,
      rise,
      minutesToPeak: Math.round((peakR.t - start) / MIN),
      level: levelFor(rise),
      recoveredAfter: back ? Math.round((back.t - start) / MIN) : null,
      cutByExercise: workout != null,
    })
  }
  return out
}

export interface FoodImpact {
  name: string
  events: number
  avgRise: number
  level: ResponseLevel
}

/** Average rise after meals that included each food. Mixed meals share the credit, so this is a hint, not proof. */
export function foodImpacts(responses: MealResponse[]): FoodImpact[] {
  const byFood = new Map<string, number[]>()
  for (const r of responses) for (const f of new Set(r.foods)) byFood.set(f, [...(byFood.get(f) ?? []), r.rise])
  return [...byFood.entries()]
    .map(([name, rises]) => {
      const avgRise = Math.round(rises.reduce((a, b) => a + b, 0) / rises.length)
      return { name, events: rises.length, avgRise, level: levelFor(avgRise) }
    })
    .sort((a, b) => b.avgRise - a.avgRise)
}

export interface ExerciseEffect {
  exercise: Exercise
  before: number
  lowest: number
  highest: number
  oneHourAfter: number | null
}

export function exerciseEffects(exercises: Exercise[], rs: Reading[]): ExerciseEffect[] {
  const out: ExerciseEffect[] = []
  for (const e of exercises) {
    const start = Date.parse(e.started_at)
    const end = start + e.duration_min * MIN
    const before = between(rs, start - 20 * MIN, start)
    const during = between(rs, start, end + 15 * MIN)
    if (!before.length || during.length < 2) continue
    const after = between(rs, end + 50 * MIN, end + 70 * MIN)
    out.push({
      exercise: e,
      before: Math.round(median(before.map((r) => r.v))),
      lowest: Math.min(...during.map((r) => r.v)),
      highest: Math.max(...during.map((r) => r.v)),
      oneHourAfter: after.length ? Math.round(median(after.map((r) => r.v))) : null,
    })
  }
  return out
}

export type OddKind = 'unlogged' | 'dawn' | 'exercise' | 'low_carb_spike' | 'low'

export interface OddThing {
  kind: OddKind
  at: number
  title: string
  detail: string
}

/**
 * Things that don't add up: rises with no food logged (maybe a missed entry), big rises after
 * low-carb meals (maybe hidden carbs), and lows. Rises with an obvious cause are explained.
 */
export function oddThings(rs: Reading[], logs: LogEntry[], exercises: Exercise[], responses: MealResponse[]): OddThing[] {
  const out: OddThing[] = []
  const foodTimes = logs.map((l) => Date.parse(l.eaten_at))
  let lastFlag = -Infinity
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i]
    if (r.t - lastFlag < 120 * MIN) continue
    const window = between(rs, r.t - 45 * MIN, r.t)
    if (window.length < 4) continue
    const low = window.reduce((m, x) => (x.v < m.v ? x : m), window[0])
    if (r.v - low.v < 30) continue
    const riseStart = low.t
    lastFlag = r.t
    const time = new Date(riseStart).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const fed = foodTimes.some((t) => t >= riseStart - 120 * MIN && t <= r.t)
    if (fed) continue
    const hour = new Date(riseStart).getHours()
    const workout = exercises.find((e) => {
      const s = Date.parse(e.started_at)
      // The rise overlaps the workout or the hour after it.
      return r.t >= s && riseStart <= s + (e.duration_min + 30) * MIN
    })
    const amount = `+${Math.round(r.v - low.v)} mg/dL (${low.v} → ${r.v})`
    if (workout) {
      out.push({
        kind: 'exercise',
        at: riseStart,
        title: `Rise during/after exercise at ${time}`,
        detail: `${amount}. Hard efforts release adrenaline and stored glucose; this is normal and usually settles within an hour.`,
      })
    } else if (hour >= 3 && hour < 9) {
      out.push({
        kind: 'dawn',
        at: riseStart,
        title: `Early-morning rise at ${time}`,
        detail: `${amount} with no food logged. Likely the "dawn phenomenon": morning hormones raise glucose before you eat. Common with prediabetes.`,
      })
    } else {
      out.push({
        kind: 'unlogged',
        at: riseStart,
        title: `Unexplained rise at ${time}`,
        detail: `${amount} with no food logged in the 2 hours before. Did you eat or drink something you didn't log (a latte, juice, a bite of something)? Stress, poor sleep or caffeine can also do this.`,
      })
    }
  }
  for (const m of responses) {
    if (m.netCarbs < 8 && m.rise >= 35) {
      out.push({
        kind: 'low_carb_spike',
        at: m.start,
        title: `Big rise after a low-carb ${m.meal}`,
        detail: `+${m.rise} mg/dL after only ${m.netCarbs.toFixed(1)} g net carbs (${m.foods.join(', ')}). Check for hidden carbs (sauces, dressings, breading) or something not logged.`,
      })
    }
  }
  // Lows: at least 15 minutes under 70.
  let runStart: Reading | null = null
  for (const r of rs) {
    if (r.v < RANGE.low) runStart ??= r
    else if (runStart) {
      if (r.t - runStart.t >= 15 * MIN) {
        const hour = new Date(runStart.t).getHours()
        out.push({
          kind: 'low',
          at: runStart.t,
          title: `Low at ${new Date(runStart.t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
          detail:
            hour < 6
              ? 'Under 70 mg/dL overnight. Often a "compression low" from sleeping on the sensor rather than a real low.'
              : 'Under 70 mg/dL for 15+ minutes. If you felt shaky or dizzy, mention it to your doctor.',
        })
      }
      runStart = null
    }
  }
  return out.sort((a, b) => a.at - b.at)
}
