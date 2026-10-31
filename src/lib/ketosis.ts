import { isHardSession, type Exercise } from './exercise'
import type { LogEntry } from './foods'

/**
 * First-version ketosis estimate (population-level, not yet personalized).
 * Blood BHB mostly tracks the last ~24 h of net carbs, nudged by fasting, exercise,
 * protein and whether the previous days were low-carb (adaptation).
 * It's a rough range; blood ketone readings will be used to personalize it later.
 */

export type KetoStatus = 'deep' | 'in' | 'light' | 'out'

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
}

export const STATUS_TEXT: Record<KetoStatus, string> = {
  deep: 'Deep ketosis',
  in: 'In ketosis',
  light: 'Borderline / light ketosis',
  out: 'Likely not in ketosis',
}

const H = 3_600_000
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function estimateKetosis(opts: {
  at: number
  logs: LogEntry[]
  exercises: Exercise[]
  netCarbLimit: number
  proteinTarget: number
}): KetoEstimate {
  const { at, logs, exercises, netCarbLimit, proteinTarget } = opts
  const reasons: string[] = []
  const inWindow = (from: number, to: number) => logs.filter((l) => {
    const t = Date.parse(l.eaten_at)
    return t > from && t <= to
  })
  const last24 = inWindow(at - 24 * H, at)
  const prev24 = inWindow(at - 48 * H, at - 24 * H)
  const carbs24h = sum(last24.map((l) => l.nutrients.netCarbs ?? 0))
  const carbsPrev = sum(prev24.map((l) => l.nutrients.netCarbs ?? 0))
  const unknownCarbItems = last24.filter((l) => l.nutrients.netCarbs == null && (l.nutrients.kcal ?? 0) > 0).length

  // Main driver: net carbs in the last 24 h.
  let mid = Math.max(0.1, 1.3 - 0.022 * carbs24h)
  reasons.push(
    carbs24h <= netCarbLimit
      ? `${carbs24h.toFixed(0)} g net carbs in the last 24 h, within your ${netCarbLimit} g limit.`
      : `${carbs24h.toFixed(0)} g net carbs in the last 24 h, ${(carbs24h - netCarbLimit).toFixed(0)} g over your ${netCarbLimit} g limit.`,
  )

  // Carry-over from the day before, and adaptation.
  if (prev24.length && carbsPrev > 60) {
    mid *= 0.8
    reasons.push(`The day before was also high (${carbsPrev.toFixed(0)} g), so ketone production is still ramping back up.`)
  }

  // Hours without food.
  const lastMeal = Math.max(-Infinity, ...last24.map((l) => Date.parse(l.eaten_at)), ...prev24.map((l) => Date.parse(l.eaten_at)))
  const fastH = Number.isFinite(lastMeal) ? (at - lastMeal) / H : null
  if (fastH != null && fastH >= 12 && carbs24h <= 2 * netCarbLimit) {
    const bump = fastH >= 16 ? 0.35 : 0.15
    mid += bump
    reasons.push(`${Math.floor(fastH)} h since your last food: fasting raises ketones.`)
  }

  // Exercise in the last 24 h (its glycogen-burning effect lasts about a day).
  const recent = exercises.filter((e) => {
    const t = Date.parse(e.started_at)
    return t <= at && t > at - 24 * H
  })
  if (recent.some(isHardSession)) {
    mid += carbs24h > 3 * netCarbLimit ? 0.05 : 0.15
    reasons.push(
      carbs24h > 3 * netCarbLimit
        ? 'Hard exercise helps use up stored glucose, but not enough to offset this many carbs.'
        : 'Hard exercise in the last 24 h uses up stored glucose and nudges ketones up.',
    )
  }
  if (recent.some((e) => e.meta.fasted)) {
    mid += 0.1
    reasons.push('A fasted workout tends to raise ketones more.')
  }

  // Protein well above target can be partly turned into glucose.
  const protein24 = sum(last24.map((l) => l.nutrients.protein ?? 0))
  if (protein24 > proteinTarget * 1.3) {
    mid = Math.max(0.05, mid - 0.1)
    reasons.push(`Protein was high (${protein24.toFixed(0)} g); some of it can become glucose.`)
  }

  if (unknownCarbItems) reasons.push(`${unknownCarbItems} food${unknownCarbItems > 1 ? 's have' : ' has'} no carb data, so carbs may be higher than counted.`)
  if (!last24.length) reasons.push('Nothing logged in the last 24 h, so this is a guess.')

  mid = Math.round(Math.max(0.05, mid) * 100) / 100
  const status: KetoStatus = mid >= 1.5 ? 'deep' : mid >= 0.5 ? 'in' : mid >= 0.3 ? 'light' : 'out'
  return {
    low: Math.round(mid * 0.6 * 10) / 10,
    mid,
    high: Math.round(mid * 1.6 * 10) / 10,
    status,
    carbs24h,
    unknownCarbItems,
    reasons,
  }
}

/** Tomorrow at 7 AM, assuming nothing more is eaten tonight. */
export function tomorrowMorning(now = new Date()): number {
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  d.setHours(7, 0, 0, 0)
  return d.getTime()
}
