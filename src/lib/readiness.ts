import type { ActivityDay } from './activity'
import { formatSleep } from './activity'

/**
 * The app's own readiness score (0–100), built like Fitbit's from the same three signals, each compared
 * with your own last 30 days: overnight HRV (higher = better recovered), resting heart rate
 * (lower = better) and sleep (last night, plus the last 3 nights). Not Fitbit's number, which
 * Google Health doesn't share.
 */

export type ReadinessBand = 'high' | 'moderate' | 'low'

export interface Readiness {
  score: number
  band: ReadinessBand
  parts: { label: string; score: number; detail: string }[]
  /** Parts that had no data, e.g. HRV before it's been imported. */
  missing: string[]
}

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)))
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

const shift = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Sleep points: 7.5 h asleep or more is full marks; each half hour short costs about 15. */
const sleepPoints = (min: number) => clamp(100 - Math.max(0, 450 - min) / 2)

export function readinessFor(day: string, activity: Record<string, ActivityDay>): Readiness | null {
  const today = activity[day]
  if (!today) return null
  const history = Array.from({ length: 30 }, (_, i) => activity[shift(day, -1 - i)]).filter((d): d is ActivityDay => !!d && !d.deleted_at)
  const parts: Readiness['parts'] = []
  const missing: string[] = []
  const weights: number[] = []

  const hrvs = history.map((d) => d.meta.hrvMs).filter((x): x is number => x != null && x > 0)
  const hrv = today.meta.hrvMs
  if (hrv != null && hrvs.length >= 7) {
    const base = mean(hrvs)
    const change = hrv / base - 1
    // Your normal scores 60; +20% scores 90, −20% scores 30.
    parts.push({ label: 'HRV', score: clamp(60 + 150 * change), detail: `${Math.round(hrv)} ms, ${Math.abs(Math.round(change * 100))}% ${change >= 0 ? 'above' : 'below'} your normal (${Math.round(base)})` })
    weights.push(0.4)
  } else missing.push('HRV')

  const rhrs = history.map((d) => d.resting_hr).filter((x): x is number => x != null && x > 0)
  const rhr = today.resting_hr
  if (rhr != null && rhrs.length >= 7) {
    const base = mean(rhrs)
    const diff = rhr - base
    // Your normal scores 60; each beat above it costs 10 points.
    parts.push({ label: 'Resting HR', score: clamp(60 - 10 * diff), detail: `${rhr} bpm, ${Math.abs(Math.round(diff * 10) / 10)} ${diff >= 0 ? 'above' : 'below'} your normal (${Math.round(base)})` })
    weights.push(0.3)
  } else missing.push('resting heart rate')

  const lastNight = today.sleep_minutes
  if (lastNight) {
    const recent = [lastNight, ...[1, 2].map((i) => activity[shift(day, -i)]?.sleep_minutes).filter((x): x is number => !!x)]
    const avg3 = mean(recent)
    parts.push({ label: 'Sleep', score: clamp(0.6 * sleepPoints(lastNight) + 0.4 * sleepPoints(avg3)), detail: `${formatSleep(lastNight)} last night, ${formatSleep(avg3)} over ${recent.length} nights` })
    weights.push(0.3)
  } else missing.push('sleep')

  if (!parts.length || parts.length === 1) return null
  const total = weights.reduce((a, b) => a + b, 0)
  const score = clamp(parts.reduce((s, p, i) => s + p.score * weights[i], 0) / total)
  return { score, band: score >= 70 ? 'high' : score >= 45 ? 'moderate' : 'low', parts, missing }
}

export const READINESS_TEXT: Record<ReadinessBand, string> = {
  high: 'Well recovered: a good day for a hard session.',
  moderate: 'Moderately recovered: train as planned, keep the intensity in check.',
  low: 'Low recovery: favor yoga, a walk or easy cardio, and prioritize sleep tonight.',
}
