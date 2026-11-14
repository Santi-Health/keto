import type { DayEnergy } from './deficit'
import type { BodyScan } from './readings'

/**
 * A 12-week plan from the last DEXA to a body-fat goal, holding lean mass: where you should be each week,
 * where you are (from logged deficit and from weigh-ins), and where this pace lands you.
 */

export interface GoalPlan {
  /** Day week 1 starts (YYYY-MM-DD). */
  start: string
  weeks: number
  targetBfPct: number
}

export const KCAL_PER_LB_FAT = 3500
const KG_PER_LB = 0.45359237
/** DEXA retests: halfway, to check lean mass held, and at the end. */
export const RESCAN_WEEKS = [6, 12]

export interface PlanWeek {
  week: number
  /** Last day of the week. */
  end: string
  targetWeightLb: number
  targetFatLb: number
  targetBfPct: number
  /** Average of that week's weigh-ins, when there are any. */
  weighInLb: number | null
  weighIns: number
}

export interface PlanStatus {
  plan: GoalPlan
  /** 1-based; 0 before it starts, weeks + 1 after it ends. */
  week: number
  /** Days into the plan (0 on the first day). */
  day: number
  baseline: { date: string; weightLb: number; fatLb: number; leanLb: number; bfPct: number }
  /** Lean + bone held constant; at the goal this is the rest of your weight. */
  fatFreeLb: number
  /** Estimated at the plan start: the scan, less fat your logged deficit burned since. */
  startFatLb: number
  goalFatLb: number
  goalWeightLb: number
  /** Fat to lose over the whole plan, and per week. */
  toLoseLb: number
  perWeekLb: number
  /** Deficit a day that loses fat at that rate. */
  dailyDeficit: number
  weeks: PlanWeek[]
  /** Where you should be today. */
  targetTodayFatLb: number
  /** Fat lost so far from your logged deficit, and from your weigh-ins (last 7 days' average vs. the plan's start weight). */
  lostByDeficitLb: number
  lostByScaleLb: number | null
  /** Body fat % now by each estimate. */
  bfByDeficit: number
  bfByScale: number | null
  /** Recent pace (last 14 logged days) and where it lands at the end. */
  paceLbPerWeek: number | null
  predictedBfPct: number | null
  /** Weeks from now to reach the goal at this pace. */
  weeksToGoal: number | null
  /** Positive = ahead of the plan, in lb of fat. */
  aheadLb: number
}

const day0 = (d: string) => new Date(`${d}T12:00:00`).getTime()
export const shiftDay = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const between = (a: string, b: string) => Math.round((day0(b) - day0(a)) / 86_400_000)
const r1 = (x: number) => Math.round(x * 10) / 10

export function planStatus(opts: {
  plan: GoalPlan
  today: string
  /** The latest DEXA on or before the plan start. */
  scan: { date: string; scan: BodyScan }
  /** Burned vs. eaten for each full day from the scan to yesterday. */
  energy: DayEnergy[]
  /** Weigh-ins: day and kg. */
  weights: { day: string; kg: number }[]
}): PlanStatus | null {
  const { plan, today, scan, energy, weights } = opts
  const s = scan.scan
  if (s.totalMassKg == null || s.leanMassKg == null || s.fatMassKg == null) return null
  const weightLb = s.totalMassKg / KG_PER_LB
  const fatLb = s.fatMassKg / KG_PER_LB
  const fatFreeLb = weightLb - fatLb
  const deficitLb = (from: string, to: string) =>
    energy.filter((d) => d.logged && d.day >= from && d.day < to).reduce((sum, d) => sum + d.deficit, 0) / KCAL_PER_LB_FAT
  const startFatLb = fatLb - Math.max(0, deficitLb(scan.date, plan.start))
  const goalFatLb = (fatFreeLb / (1 - plan.targetBfPct / 100)) * (plan.targetBfPct / 100)
  const toLoseLb = Math.max(0, startFatLb - goalFatLb)
  const perWeekLb = toLoseLb / plan.weeks
  const fatAt = (days: number) => startFatLb - perWeekLb * (days / 7)
  const bf = (fat: number) => (fat / (fatFreeLb + fat)) * 100

  const weeks: PlanWeek[] = Array.from({ length: plan.weeks }, (_, i) => {
    const from = shiftDay(plan.start, i * 7)
    const end = shiftDay(plan.start, i * 7 + 6)
    const fat = fatAt((i + 1) * 7)
    const w = weights.filter((x) => x.day >= from && x.day <= end)
    return {
      week: i + 1,
      end,
      targetFatLb: r1(fat),
      targetWeightLb: r1(fatFreeLb + fat),
      targetBfPct: r1(bf(fat)),
      weighInLb: w.length ? r1(w.reduce((a, x) => a + x.kg, 0) / w.length / KG_PER_LB) : null,
      weighIns: w.length,
    }
  })

  const day = Math.max(0, between(plan.start, today))
  const week = today < plan.start ? 0 : Math.min(plan.weeks + 1, Math.floor(day / 7) + 1)
  const targetTodayFatLb = fatAt(Math.min(day, plan.weeks * 7))
  const lostByDeficitLb = Math.max(0, deficitLb(plan.start, today))
  // The scale: last 7 days' average against the plan's starting weight, all of it counted as fat (lean held).
  const recent = weights.filter((x) => x.day > shiftDay(today, -7) && x.day <= today)
  const startWeight = fatFreeLb + startFatLb
  const lostByScaleLb = recent.length ? startWeight - recent.reduce((a, x) => a + x.kg, 0) / recent.length / KG_PER_LB : null
  const fatNowDeficit = startFatLb - lostByDeficitLb
  const fatNowScale = lostByScaleLb == null ? null : startFatLb - lostByScaleLb

  // Pace from the last 14 days with food logged.
  const last = energy.filter((d) => d.logged && d.day >= shiftDay(today, -14) && d.day < today)
  const paceLbPerWeek = last.length >= 5 ? (last.reduce((a, d) => a + d.deficit, 0) / last.length / KCAL_PER_LB_FAT) * 7 : null
  const daysLeft = Math.max(0, plan.weeks * 7 - day)
  const remaining = fatNowDeficit - goalFatLb
  const predictedFat = paceLbPerWeek == null ? null : fatNowDeficit - paceLbPerWeek * (daysLeft / 7)
  return {
    plan,
    week,
    day,
    baseline: { date: scan.date, weightLb: r1(weightLb), fatLb: r1(fatLb), leanLb: r1(s.leanMassKg / KG_PER_LB), bfPct: r1(s.bodyFatPct ?? bf(fatLb)) },
    fatFreeLb: r1(fatFreeLb),
    startFatLb: r1(startFatLb),
    goalFatLb: r1(goalFatLb),
    goalWeightLb: r1(fatFreeLb + goalFatLb),
    toLoseLb: r1(toLoseLb),
    perWeekLb: Math.round(perWeekLb * 100) / 100,
    dailyDeficit: Math.round((perWeekLb * KCAL_PER_LB_FAT) / 7),
    weeks,
    targetTodayFatLb: r1(targetTodayFatLb),
    lostByDeficitLb: r1(lostByDeficitLb),
    lostByScaleLb: lostByScaleLb == null ? null : r1(lostByScaleLb),
    bfByDeficit: r1(bf(fatNowDeficit)),
    bfByScale: fatNowScale == null ? null : r1(bf(fatNowScale)),
    paceLbPerWeek: paceLbPerWeek == null ? null : Math.round(paceLbPerWeek * 100) / 100,
    predictedBfPct: predictedFat == null ? null : r1(bf(Math.max(0, predictedFat))),
    weeksToGoal: paceLbPerWeek && paceLbPerWeek > 0.05 ? r1(Math.max(0, remaining) / paceLbPerWeek) : null,
    aheadLb: r1(targetTodayFatLb - fatNowDeficit),
  }
}
