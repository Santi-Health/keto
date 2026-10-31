import type { ActivityDay } from './activity'
import { toReadings, type CgmDay } from './cgm'
import type { Exercise } from './exercise'
import type { LogEntry } from './foods'
import { summarize } from './glucoseInsights'
import { addNutrients } from './nutrients'
import { gkiFor, type ReadingRow } from './readings'
import { localDate } from './targets'
import { entryDay } from './time'

/** One row per local day, for trend charts, averages and the doctor summary. */
export interface DayPoint {
  day: string
  /** Something was logged (food), so intake numbers are meaningful. */
  logged: boolean
  kcal: number
  netCarbs: number
  protein: number
  fat: number
  fiber: number
  sodiumMg: number
  potassiumMg: number
  magnesiumMg: number
  burn: number | null
  steps: number | null
  sleepMin: number | null
  restingHr: number | null
  /** Latest weigh-in that day (kg). */
  weightKg: number | null
  /** Average blood ketone reading that day (mmol/L). */
  ketones: number | null
  /** What the estimate said at those readings, on average. */
  ketonesPredicted: number | null
  gki: number | null
  /** CGM daily average and 3–6 AM average (mg/dL). */
  glucoseAvg: number | null
  glucoseOvernight: number | null
  glucoseInRangePct: number | null
  /** Finger-stick fasting glucose (mg/dL). */
  fastingGlucose: number | null
  exerciseMin: number
}

export const RANGES = [7, 30, 90] as const
export type RangeDays = (typeof RANGES)[number]

export function lastDays(n: number, today = localDate()): string[] {
  const end = new Date(`${today}T12:00:00`)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end)
    d.setDate(d.getDate() - (n - 1 - i))
    return localDate(d)
  })
}

const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10)

export function dailySeries(opts: {
  days: string[]
  logs: LogEntry[]
  readings: ReadingRow[]
  exercises: Exercise[]
  activity: Record<string, ActivityDay>
  cgmDays: Record<string, CgmDay>
}): DayPoint[] {
  const { days, logs, readings, exercises, activity, cgmDays } = opts
  const dayOf = (iso: string, tz?: string) => entryDay(iso, tz)
  const by = <T,>(xs: T[], get: (x: T) => string) => {
    const m = new Map<string, T[]>()
    for (const x of xs) m.set(get(x), [...(m.get(get(x)) ?? []), x])
    return m
  }
  const logsBy = by(logs, (l) => dayOf(l.eaten_at, l.meta?.tz))
  const readingsBy = by(readings, (r) => dayOf(r.taken_at, r.meta?.tz))
  const exBy = by(exercises, (e) => dayOf(e.started_at, e.meta?.tz))

  return days.map((day) => {
    const n = addNutrients((logsBy.get(day) ?? []).map((l) => l.nutrients))
    const rs = readingsBy.get(day) ?? []
    const ketones = rs.filter((r) => r.kind === 'blood_ketone' && r.value != null)
    const cgm = cgmDays[day] && !cgmDays[day].deleted_at ? toReadings([cgmDays[day]]) : []
    const g = summarize(cgm)
    const gkis = ketones.map((k) => gkiFor(k, readings, cgm)?.value).filter((v): v is number => v != null)
    const weights = rs.filter((r) => r.kind === 'weight' && r.value != null).sort((a, b) => a.taken_at.localeCompare(b.taken_at))
    const fasting = rs.filter((r) => r.kind === 'glucose' && r.context === 'fasted' && r.value != null)
    const a = activity[day]
    return {
      day,
      logged: (logsBy.get(day) ?? []).length > 0,
      kcal: Math.round(n.kcal),
      netCarbs: r1(n.netCarbs)!,
      protein: Math.round(n.protein),
      fat: Math.round(n.fat),
      fiber: r1(n.fiber)!,
      sodiumMg: Math.round(n.sodiumMg),
      potassiumMg: Math.round(n.potassiumMg),
      magnesiumMg: Math.round(n.magnesiumMg),
      // Today's burn is only partway through the day, so it's left out of trends.
      burn: a?.calories_out && a.calories_out > 0 && day !== localDate() ? a.calories_out : null,
      steps: a?.steps ?? null,
      sleepMin: a?.sleep_minutes || null,
      restingHr: a?.resting_hr ?? null,
      weightKg: weights.length ? weights[weights.length - 1].value : null,
      ketones: r1(avgOf(ketones.map((k) => k.value as number))),
      ketonesPredicted: r1(avgOf(ketones.map((k) => k.predicted_value).filter((v): v is number => v != null))),
      gki: r1(avgOf(gkis)),
      glucoseAvg: g?.avg ?? null,
      glucoseOvernight: g?.overnight ?? null,
      glucoseInRangePct: g?.inRangePct ?? null,
      fastingGlucose: avgOf(fasting.map((f) => f.value as number)) == null ? null : Math.round(avgOf(fasting.map((f) => f.value as number))!),
      exerciseMin: Math.round((exBy.get(day) ?? []).reduce((s, e) => s + e.duration_min, 0)),
    }
  })
}

/** Averages over a range. Intake uses only days with food logged; today counts only if logged. */
export interface RangeSummary {
  days: number
  loggedDays: number
  kcal: number | null
  netCarbs: number | null
  protein: number | null
  fat: number | null
  fiber: number | null
  sodiumMg: number | null
  potassiumMg: number | null
  magnesiumMg: number | null
  daysUnderCarbLimit: number
  burn: number | null
  steps: number | null
  sleepMin: number | null
  restingHr: number | null
  weightStartKg: number | null
  weightEndKg: number | null
  ketones: number | null
  ketoneReadings: number
  daysInKetosis: number
  gki: number | null
  glucoseAvg: number | null
  glucoseOvernight: number | null
  glucoseInRangePct: number | null
  fastingGlucose: number | null
  exerciseMinPerWeek: number
}

export function summarizeRange(points: DayPoint[], readings: ReadingRow[], netCarbLimit: number): RangeSummary {
  const logged = points.filter((p) => p.logged)
  const avg = (get: (p: DayPoint) => number | null, from = points) => {
    const v = avgOf(from.map(get).filter((x): x is number => x != null))
    return v == null ? null : Math.round(v * 10) / 10
  }
  const weights = points.filter((p) => p.weightKg != null)
  const from = points[0]?.day
  const to = points[points.length - 1]?.day
  const ketoneReadings = readings.filter((r) => r.kind === 'blood_ketone' && r.value != null && entryDay(r.taken_at, r.meta?.tz) >= from && entryDay(r.taken_at, r.meta?.tz) <= to)
  return {
    days: points.length,
    loggedDays: logged.length,
    kcal: avg((p) => p.kcal, logged),
    netCarbs: avg((p) => p.netCarbs, logged),
    protein: avg((p) => p.protein, logged),
    fat: avg((p) => p.fat, logged),
    fiber: avg((p) => p.fiber, logged),
    sodiumMg: avg((p) => p.sodiumMg, logged),
    potassiumMg: avg((p) => p.potassiumMg, logged),
    magnesiumMg: avg((p) => p.magnesiumMg, logged),
    daysUnderCarbLimit: logged.filter((p) => p.netCarbs <= netCarbLimit).length,
    burn: avg((p) => p.burn),
    steps: avg((p) => p.steps),
    sleepMin: avg((p) => p.sleepMin),
    restingHr: avg((p) => p.restingHr),
    weightStartKg: weights[0]?.weightKg ?? null,
    weightEndKg: weights[weights.length - 1]?.weightKg ?? null,
    ketones: avg((p) => p.ketones),
    ketoneReadings: ketoneReadings.length,
    daysInKetosis: points.filter((p) => p.ketones != null && p.ketones >= 0.5).length,
    gki: avg((p) => p.gki),
    glucoseAvg: avg((p) => p.glucoseAvg),
    glucoseOvernight: avg((p) => p.glucoseOvernight),
    glucoseInRangePct: avg((p) => p.glucoseInRangePct),
    fastingGlucose: avg((p) => p.fastingGlucose),
    exerciseMinPerWeek: Math.round((points.reduce((s, p) => s + p.exerciseMin, 0) / Math.max(1, points.length)) * 7),
  }
}
