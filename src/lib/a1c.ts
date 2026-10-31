import { toReadings, type CgmDay } from './cgm'
import type { ReadingRow } from './readings'
import { localDate } from './targets'

/**
 * Estimated A1C from CGM data, using the Glucose Management Indicator (Bergenstal et al., 2018):
 *   GMI (%) = 3.31 + 0.02392 × mean glucose (mg/dL)
 * It needs about 14 days of CGM with at least ~70% wear to be reliable. A lab HbA1c can differ from
 * GMI by up to ±0.5 points for the same average glucose (red blood cell lifespan and other factors),
 * so when a lab result overlaps CGM data, the app learns that personal offset and applies it.
 */

export const gmi = (meanMgDl: number) => Math.round((3.31 + 0.02392 * meanMgDl) * 10) / 10

/** Lingo reads every 5 minutes: a full day of wear is 288 readings. */
const FULL_DAY_READINGS = 288

export interface A1cWindow {
  days: number
  /** Days in the window with at least half a day of CGM wear. */
  daysWithData: number
  /** Share of the window covered by CGM readings (0–100). */
  coveragePct: number
  meanGlucose: number | null
  gmi: number | null
  /** Enough data to trust (≥ 10 days and ≥ 70% coverage for the 14-day window). */
  reliable: boolean
}

export function a1cWindow(cgmDays: Record<string, CgmDay>, days: number, today = localDate()): A1cWindow {
  const end = new Date(`${today}T12:00:00`)
  const list: string[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    list.push(localDate(d))
  }
  const present = list.map((d) => cgmDays[d]).filter((d): d is CgmDay => !!d && !d.deleted_at)
  const readings = toReadings(present)
  // Average per day first, so days with denser readings don't count more.
  const dayMeans = present
    .map((d) => d.points.map((p) => p[1]))
    .filter((vs) => vs.length >= FULL_DAY_READINGS / 2)
    .map((vs) => vs.reduce((a, b) => a + b, 0) / vs.length)
  const mean = dayMeans.length ? dayMeans.reduce((a, b) => a + b, 0) / dayMeans.length : null
  const coveragePct = Math.min(100, Math.round((readings.length / (days * FULL_DAY_READINGS)) * 100))
  return {
    days,
    daysWithData: dayMeans.length,
    coveragePct,
    meanGlucose: mean == null ? null : Math.round(mean),
    gmi: mean == null ? null : gmi(mean),
    reliable: dayMeans.length >= Math.min(10, days) && coveragePct >= 70,
  }
}

export interface A1cEstimate {
  recent: A1cWindow
  quarter: A1cWindow
  /** Latest lab HbA1c, if any. */
  lab: { value: number; date: string } | null
  /** Lab minus GMI over the 90 days before the lab, when CGM covered at least 14 of them. */
  personalOffset: number | null
  /** Best single estimate: the 90-day GMI if reliable, else 14-day, plus the personal offset. */
  estimate: number | null
  /** early: under 14 days of data; good: 14+ days with ~70% wear; strong: 30+ days. */
  confidence: 'early' | 'good' | 'strong' | null
  /** Full days of CGM behind the estimate. */
  basedOnDays: number
  band: 'normal' | 'prediabetes' | 'diabetes' | null
}

export const a1cBand = (v: number): A1cEstimate['band'] => (v < 5.7 ? 'normal' : v < 6.5 ? 'prediabetes' : 'diabetes')

export function estimateA1c(cgmDays: Record<string, CgmDay>, readings: ReadingRow[], today = localDate()): A1cEstimate {
  const recent = a1cWindow(cgmDays, 14, today)
  const quarter = a1cWindow(cgmDays, 90, today)
  const labRow = readings
    .filter((r) => r.kind === 'lab' && r.value != null && /a1c/i.test(r.meta.test ?? ''))
    .sort((a, b) => b.taken_at.localeCompare(a.taken_at))[0]
  const lab = labRow ? { value: labRow.value as number, date: localDate(new Date(labRow.taken_at)) } : null
  let personalOffset: number | null = null
  if (lab) {
    const before = a1cWindow(cgmDays, 90, lab.date)
    if (before.gmi != null && before.daysWithData >= 14) personalOffset = Math.round((lab.value - before.gmi) * 10) / 10
  }
  // HbA1c reflects ~3 months (weighted to the last 30 days); use the longest window with enough data.
  // The 90-day window is the average of whatever full days it has, so it is the right base from 3 days on.
  const use = quarter.daysWithData >= 3 ? quarter : null
  const base = use?.gmi ?? null
  const estimate = base == null ? null : Math.round((base + (personalOffset ?? 0)) * 10) / 10
  const n = use?.daysWithData ?? 0
  const confidence = base == null ? null : n >= 30 ? 'strong' : n >= 14 && recent.coveragePct >= 70 ? 'good' : 'early'
  return { recent, quarter, lab, personalOffset, estimate, band: estimate == null ? null : a1cBand(estimate), confidence, basedOnDays: n }
}
