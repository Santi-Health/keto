import type { ActivityDay } from './activity'
import { formatSleep } from './activity'

/**
 * The app's own readiness score (0–100), built like Fitbit's from the same three signals, each compared
 * with your own last 30 days: overnight HRV (35%, higher = better recovered), resting heart rate
 * (20%, lower = better) and sleep (45%: mostly last night, plus the last 3 nights). A night under
 * 6 hours also caps the score, so good HRV can't hide a short night. Not Fitbit's number, which
 * Google Health doesn't share.
 *
 * Overnight vitals catch what those three miss, getting sick: skin temperature well above your baseline,
 * faster breathing or lower blood oxygen. Two signs hold the score at 10, a sick day; one sign holds it in the
 * low band only with HRV well down too, since a warm night or a drink can lift skin temperature alone.
 * Tuned on real nights: a flu night (Oct 29) showed skin +1.9 °C, breathing +2.1 and HRV −55%; a merely
 * tired night (Nov 8) had HRV −43% with normal vitals.
 */

export type ReadinessBand = 'high' | 'moderate' | 'low'

export interface Readiness {
  score: number
  band: ReadinessBand
  /** short: the headline value for the gauge view, e.g. "62.7 ms · +14%". */
  parts: { label: string; score: number; detail: string; short: string }[]
  /** Parts that had no data, e.g. HRV before it's been imported. */
  missing: string[]
  /** Set when a short night held the score down. */
  cappedBySleep?: { cap: number; minutes: number }
  /** Last night's vitals against your normal; sign = outside your usual range. */
  vitals: { label: string; short: string; detail: string; sign: boolean }[]
  /** Set when vitals point to getting sick. */
  illness?: { cap: number; signs: string[] }
}

/** Skin temperature this far above baseline, breathing this much faster, or blood oxygen this much lower is a sign. */
export const SKIN_TEMP_SIGN_C = 1
export const BREATHING_SIGN = 1.5
export const SPO2_SIGN = 2
/** One sign counts only with HRV at least this far below normal. */
export const ILLNESS_HRV_DROP = 0.25
/** The score with one sign of illness (and HRV down) can't go above this (low band); with two or more, this. */
export const ILLNESS_CAP = [44, 10]
/** Skin readings outside this range are sensor glitches (one night read 41.8 °C), not temperature. */
const skinOk = (c: number | undefined) => (c != null && c >= 30 && c <= 40 ? c : undefined)

/** Under 6 hours asleep the score can't go above this: 30 at 4 h, rising to 65 at 6 h. */
export const shortSleepCap = (minutes: number) => (minutes >= 360 ? 100 : Math.round(30 + (Math.max(240, minutes) - 240) * (35 / 120)))

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
  let hrvChange = 0
  if (hrv != null && hrvs.length >= 7) {
    const base = mean(hrvs)
    const change = hrv / base - 1
    hrvChange = change
    // Your normal scores 60; +20% scores 90, −20% scores 30.
    parts.push({ label: 'HRV', score: clamp(60 + 150 * change), short: `${Math.round(hrv)} ms · ${change >= 0 ? '+' : '−'}${Math.abs(Math.round(change * 100))}%`, detail: `${Math.round(hrv)} ms, ${Math.abs(Math.round(change * 100))}% ${change >= 0 ? 'above' : 'below'} your normal (${Math.round(base)})` })
    weights.push(0.35)
  } else missing.push('HRV')

  const rhrs = history.map((d) => d.resting_hr).filter((x): x is number => x != null && x > 0)
  const rhr = today.resting_hr
  if (rhr != null && rhrs.length >= 7) {
    const base = mean(rhrs)
    const diff = rhr - base
    // Your normal scores 60; each beat above it costs 10 points.
    parts.push({ label: 'Resting HR', score: clamp(60 - 10 * diff), short: `${rhr} bpm · ${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${Math.abs(Math.round(diff))}`, detail: `${rhr} bpm, ${Math.abs(Math.round(diff * 10) / 10)} ${diff >= 0 ? 'above' : 'below'} your normal (${Math.round(base)})` })
    weights.push(0.2)
  } else missing.push('resting heart rate')

  const lastNight = today.sleep_minutes
  if (lastNight) {
    const recent = [lastNight, ...[1, 2].map((i) => activity[shift(day, -i)]?.sleep_minutes).filter((x): x is number => !!x)]
    const avg3 = mean(recent)
    parts.push({ label: 'Sleep', score: clamp(0.75 * sleepPoints(lastNight) + 0.25 * sleepPoints(avg3)), short: formatSleep(lastNight), detail: `${formatSleep(lastNight)} last night, ${formatSleep(avg3)} over ${recent.length} nights` })
    weights.push(0.45)
  } else missing.push('sleep')

  if (!parts.length || parts.length === 1) return null
  const total = weights.reduce((a, b) => a + b, 0)
  const blended = clamp(parts.reduce((s, p, i) => s + p.score * weights[i], 0) / total)
  const cap = lastNight ? shortSleepCap(lastNight) : 100
  const vitals = vitalsFor(today, history)
  const signs = vitals.filter((v) => v.sign).map((v) => v.label.toLowerCase())
  const ill = signs.length >= 2 || (signs.length === 1 && hrvChange <= -ILLNESS_HRV_DROP)
  const illCap = ill ? ILLNESS_CAP[Math.min(signs.length, 2) - 1] : 100
  const score = Math.min(blended, cap, illCap)
  return {
    score,
    band: score >= 70 ? 'high' : score >= 45 ? 'moderate' : 'low',
    parts,
    missing,
    cappedBySleep: cap < blended && cap <= illCap ? { cap, minutes: lastNight! } : undefined,
    vitals,
    illness: ill ? { cap: illCap, signs } : undefined,
  }
}

const signed = (x: number, digits: number) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(digits)}`

/** Last night's breathing rate, skin temperature and blood oxygen, each against your own normal. */
export function vitalsFor(today: ActivityDay, history: ActivityDay[]): Readiness['vitals'] {
  const out: Readiness['vitals'] = []
  const normal = (get: (d: ActivityDay) => number | undefined) => {
    const xs = history.map(get).filter((x): x is number => x != null && x > 0)
    return xs.length >= 7 ? mean(xs) : null
  }
  const m = today.meta
  const skin = skinOk(m.skinTempC)
  if (skin != null) {
    const base = skinOk(m.skinTempBaseC) ?? normal((d) => skinOk(d.meta.skinTempC))
    if (base != null) {
      const diff = Math.round((skin - base) * 10) / 10
      out.push({ label: 'Skin temp', short: `${signed(diff, 1)} °C`, detail: `skin temperature ${signed(diff, 1)} °C vs your normal`, sign: diff >= SKIN_TEMP_SIGN_C })
    }
  }
  if (m.breathingRate != null) {
    const base = normal((d) => d.meta.breathingRate)
    const diff = base == null ? 0 : Math.round((m.breathingRate - base) * 10) / 10
    out.push({ label: 'Breathing', short: `${m.breathingRate.toFixed(1)}/min${base == null ? '' : ` · ${signed(diff, 1)}`}`, detail: `breathing ${m.breathingRate.toFixed(1)}/min${base == null ? '' : `, ${signed(diff, 1)} vs your normal (${base.toFixed(1)})`}`, sign: base != null && diff >= BREATHING_SIGN })
  }
  if (m.spo2Pct != null) {
    const base = normal((d) => d.meta.spo2Pct)
    const diff = base == null ? 0 : Math.round((m.spo2Pct - base) * 10) / 10
    out.push({ label: 'Blood oxygen', short: `${Math.round(m.spo2Pct)}%${base == null ? '' : ` · ${signed(diff, 1)}`}`, detail: `blood oxygen ${Math.round(m.spo2Pct)}%${base == null ? '' : `, ${signed(diff, 1)} vs your normal (${Math.round(base)}%)`}`, sign: (base != null && diff <= -SPO2_SIGN) || m.spo2Pct < 92 })
  }
  return out
}

export const READINESS_TEXT: Record<ReadinessBand, string> = {
  high: 'Well recovered: a good day for a hard session.',
  moderate: 'Moderately recovered: train as planned, keep the intensity in check.',
  low: 'Low recovery: favor yoga, a walk or easy cardio, and prioritize sleep tonight.',
}

export const ILLNESS_TEXT = 'Signs you may be getting sick: rest, drink fluids and skip hard training today.'
