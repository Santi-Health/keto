import { isHardSession, type Exercise } from './exercise'
import type { LogEntry } from './foods'

/**
 * Ketosis estimate. The population part tracks the last ~24 h of net carbs, the carry-over from
 * the two days before, fasting, exercise and protein. A personal model fitted to blood ketone
 * readings (see ketoModel.ts) then adjusts it and narrows the range.
 */

export type KetoStatus = 'deep' | 'in' | 'light' | 'out'

/** Inputs the personal model learns weights for. */
export interface KetoFeatures {
  /** Net carbs in the last 24 h. */
  carbs24h: number
  /** Carbs above the limit 24–72 h ago, weighted toward the more recent day. */
  carryOver: number
  /** Hours since the last food (capped at 24). */
  fastH: number
  /** 1 if a hard session happened in the last 24 h. */
  hardExercise: number
  /** Protein in the last 24 h as a fraction of target. */
  proteinRatio: number
}

/** Learned adjustment applied on top of the population estimate (log scale). */
export interface KetoAdjuster {
  adjust: (f: KetoFeatures) => number
  /** Typical error on the log scale; sets the range width. */
  sigma: number
  n: number
  reason: (f: KetoFeatures, logAdj: number) => string | null
}

export interface KetoEstimate {
  low: number
  mid: number
  high: number
  status: KetoStatus
  /** Net carbs in the 24 hours before the estimate time. */
  carbs24h: number
  /** Logged foods with no carb data in that window. */
  unknownCarbItems: number
  reasons: string[]
  /** Population estimate before personalization. */
  populationMid: number
  features: KetoFeatures
  personalized: boolean
}

export const STATUS_TEXT: Record<KetoStatus, string> = {
  deep: 'Deep ketosis',
  in: 'In ketosis',
  light: 'Borderline / light ketosis',
  out: 'Likely not in ketosis',
}

const H = 3_600_000
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
/** Spread of the population estimate on the log scale (about ×0.6 to ×1.6). */
export const POPULATION_SIGMA = 0.5

export const statusFor = (mmol: number): KetoStatus => (mmol >= 1.5 ? 'deep' : mmol >= 0.5 ? 'in' : mmol >= 0.3 ? 'light' : 'out')

/**
 * Population estimate (mmol/L) from the features alone; estimateKetosis adds the explanations.
 * `fastedWorkout` adds the small extra bump a fasted session gives.
 */
export function populationFromFeatures(f: KetoFeatures, netCarbLimit: number, fastedWorkout = false): number {
  let mid = Math.max(0.1, 1.3 - 0.022 * f.carbs24h)
  if (f.carryOver > 10) mid *= Math.exp(-0.006 * f.carryOver)
  if (f.fastH >= 12 && f.carbs24h <= 2 * netCarbLimit) mid += f.fastH >= 16 ? 0.35 : 0.15
  if (f.hardExercise) mid += f.carbs24h > 3 * netCarbLimit ? 0.05 : 0.15
  if (fastedWorkout) mid += 0.1
  if (f.proteinRatio > 1.3) mid = Math.max(0.05, mid - 0.1)
  return Math.max(0.05, mid)
}

export function estimateKetosis(opts: {
  at: number
  logs: LogEntry[]
  exercises: Exercise[]
  netCarbLimit: number
  proteinTarget: number
  model?: KetoAdjuster | null
}): KetoEstimate {
  const { at, logs, exercises, netCarbLimit, proteinTarget, model } = opts
  const reasons: string[] = []
  const inWindow = (from: number, to: number) => logs.filter((l) => {
    const t = Date.parse(l.eaten_at)
    return t > from && t <= to
  })
  const carbsIn = (ls: LogEntry[]) => sum(ls.map((l) => l.nutrients.netCarbs ?? 0))
  const last24 = inWindow(at - 24 * H, at)
  const day2 = inWindow(at - 48 * H, at - 24 * H)
  const day3 = inWindow(at - 72 * H, at - 48 * H)
  const carbs24h = carbsIn(last24)
  const carbs48 = carbsIn(day2)
  const carbs72 = carbsIn(day3)
  const unknownCarbItems = last24.filter((l) => l.nutrients.netCarbs == null && (l.nutrients.kcal ?? 0) > 0).length

  // Main driver: net carbs in the last 24 h.
  reasons.push(
    carbs24h <= netCarbLimit
      ? `${carbs24h.toFixed(0)} g net carbs in the last 24 h, within your ${netCarbLimit} g limit.`
      : `${carbs24h.toFixed(0)} g net carbs in the last 24 h, ${(carbs24h - netCarbLimit).toFixed(0)} g over your ${netCarbLimit} g limit.`,
  )

  // Carry-over: high-carb days 1–3 days ago keep ketones down while the body switches back.
  const over2 = day2.length ? Math.max(0, carbs48 - netCarbLimit) : 0
  const over3 = day3.length ? Math.max(0, carbs72 - netCarbLimit) : 0
  const carryOver = over2 + 0.5 * over3
  if (carryOver > 10) {
    reasons.push(
      over2 > 10
        ? `The day before was high (${carbs48.toFixed(0)} g), so ketone production is still ramping back up.`
        : `Two days ago was high (${carbs72.toFixed(0)} g); its effect is fading.`,
    )
  }

  // Hours without food.
  const lastMeal = Math.max(-Infinity, ...[...last24, ...day2].map((l) => Date.parse(l.eaten_at)))
  const fastH = Number.isFinite(lastMeal) ? (at - lastMeal) / H : null
  if (fastH != null && fastH >= 12 && carbs24h <= 2 * netCarbLimit) {
    reasons.push(`${Math.floor(fastH)} h since your last food: fasting raises ketones.`)
  }

  // Exercise in the last 24 h (its glycogen-burning effect lasts about a day).
  const recent = exercises.filter((e) => {
    const t = Date.parse(e.started_at)
    return t <= at && t > at - 24 * H
  })
  const hard = recent.some(isHardSession)
  if (hard) {
    reasons.push(
      carbs24h > 3 * netCarbLimit
        ? 'Hard exercise helps use up stored glucose, but not enough to offset this many carbs.'
        : 'Hard exercise in the last 24 h uses up stored glucose and nudges ketones up.',
    )
  }
  const fastedWorkout = recent.some((e) => e.meta.fasted)
  if (fastedWorkout) {
    reasons.push('A fasted workout tends to raise ketones more.')
  }

  // Protein well above target can be partly turned into glucose.
  const protein24 = sum(last24.map((l) => l.nutrients.protein ?? 0))
  if (protein24 > proteinTarget * 1.3) {
    reasons.push(`Protein was high (${protein24.toFixed(0)} g); some of it can become glucose.`)
  }

  if (unknownCarbItems) reasons.push(`${unknownCarbItems} food${unknownCarbItems > 1 ? 's have' : ' has'} no carb data, so carbs may be higher than counted.`)
  if (!last24.length) reasons.push('Nothing logged in the last 24 h, so this is a guess.')

  const features: KetoFeatures = {
    carbs24h,
    carryOver,
    fastH: Math.min(24, fastH ?? 0),
    hardExercise: hard ? 1 : 0,
    proteinRatio: proteinTarget > 0 ? protein24 / proteinTarget : 1,
  }
  const populationMid = populationFromFeatures(features, netCarbLimit, fastedWorkout)

  let mid: number
  let sigma = POPULATION_SIGMA
  let personalized = false
  if (model) {
    const logAdj = model.adjust(features)
    mid = populationMid * Math.exp(logAdj)
    sigma = model.sigma
    personalized = true
    const why = model.reason(features, logAdj)
    if (why) reasons.push(why)
  } else {
    mid = populationMid
  }

  mid = Math.round(Math.max(0.05, mid) * 100) / 100
  return {
    low: Math.round(mid * Math.exp(-sigma) * 10) / 10,
    mid,
    high: Math.round(mid * Math.exp(sigma) * 10) / 10,
    status: statusFor(mid),
    carbs24h,
    unknownCarbItems,
    reasons,
    populationMid: Math.round(populationMid * 100) / 100,
    features,
    personalized,
  }
}

/** Tomorrow at 7 AM, assuming nothing more is eaten tonight. */
export function tomorrowMorning(now = new Date()): number {
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  d.setHours(7, 0, 0, 0)
  return d.getTime()
}
