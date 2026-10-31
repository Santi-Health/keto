import type { ActivityImport } from './googleHealth'
import type { ReadingRow } from './readings'
import { dayIn, deviceTz } from './time'

/** One row per local day of Fitbit totals (synced table daily_activity, id = YYYY-MM-DD). */
export interface ActivityDay {
  id: string
  day: string
  steps: number | null
  calories_out: number | null
  resting_hr: number | null
  sleep_minutes: number | null
  meta: {
    sleepStart?: string
    sleepEnd?: string
    inBedMin?: number
    deepMin?: number
    remMin?: number
    lightMin?: number
    awakeMin?: number
    /** Overnight heart rate variability (RMSSD, ms). */
    hrvMs?: number
  }
  updated_at: string
  deleted_at: string | null
}

const empty = (day: string): ActivityDay => ({
  id: day,
  day,
  steps: null,
  calories_out: null,
  resting_hr: null,
  sleep_minutes: null,
  meta: {},
  updated_at: new Date().toISOString(),
  deleted_at: null,
})

/** Folds an import into per-day rows; returns only the days that changed. */
export function mergeActivity(imp: ActivityImport, existing: Record<string, ActivityDay>): ActivityDay[] {
  const next: Record<string, ActivityDay> = {}
  const get = (day: string) => (next[day] ??= { ...(existing[day] ?? empty(day)), meta: { ...existing[day]?.meta } })
  for (const [day, v] of Object.entries(imp.steps)) get(day).steps = v
  for (const [day, v] of Object.entries(imp.caloriesOut)) if (v > 0) get(day).calories_out = v
  for (const [day, v] of Object.entries(imp.restingHr)) get(day).resting_hr = v
  for (const [day, v] of Object.entries(imp.hrv)) get(day).meta = { ...get(day).meta, hrvMs: v }
  // Naps add to the day's sleep; the longest sleep sets the bed and wake times.
  const byDay = new Map<string, ActivityImport['sleep']>()
  for (const n of imp.sleep) byDay.set(n.day, [...(byDay.get(n.day) ?? []), n])
  for (const [day, nights] of byDay) {
    const main = [...nights].sort((a, b) => b.inBedMin - a.inBedMin)[0]
    const d = get(day)
    d.sleep_minutes = nights.reduce((s, n) => s + n.asleepMin, 0)
    d.meta = {
      ...d.meta,
      sleepStart: main.start,
      sleepEnd: main.end,
      inBedMin: main.inBedMin,
      deepMin: main.stages.DEEP,
      remMin: main.stages.REM,
      lightMin: main.stages.LIGHT,
      awakeMin: main.stages.AWAKE,
    }
  }
  return Object.values(next).filter((d) => JSON.stringify({ ...d, updated_at: '' }) !== JSON.stringify({ ...existing[d.day], updated_at: '' }))
}

/**
 * Typical daily burn: the average of the last 7 complete days with a full day of wear
 * (over 1,200 kcal, which rules out days the watch was off most of the day).
 */
export function averageBurn(days: ActivityDay[], today: string): { kcal: number; days: number } | null {
  const full = days
    .filter((d) => d.day < today && (d.calories_out ?? 0) > 1200)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 7)
  if (full.length < 3) return null
  return { kcal: Math.round(full.reduce((s, d) => s + (d.calories_out ?? 0), 0) / full.length), days: full.length }
}

/** A stable UUID for an imported item, so re-importing updates instead of duplicating. */
export async function stableUuid(key: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(key)))
  const hex = [...hash.slice(0, 16)].map((b, i) => (i === 6 ? (b & 0x0f) | 0x50 : i === 8 ? (b & 0x3f) | 0x80 : b).toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Fitbit weigh-ins as weight readings, with body fat from the same day attached. */
export async function weightReadings(imp: ActivityImport, existing: ReadingRow[], tz = deviceTz()): Promise<ReadingRow[]> {
  const out: ReadingRow[] = []
  const dayOf = (iso: string) => dayIn(tz, Date.parse(iso))
  for (const w of imp.weights) {
    const id = await stableUuid(`fitbit-weight:${w.id}`)
    const fat = imp.bodyFat.find((b) => dayOf(b.at) === dayOf(w.at))
    const prev = existing.find((r) => r.id === id)
    const kg = Math.round(w.kg * 1000) / 1000
    if (prev && prev.value === kg && (prev.meta.bodyFatPct ?? null) === (fat?.pct ?? null)) continue
    out.push({
      id,
      taken_at: w.at,
      kind: 'weight',
      value: kg,
      urine_level: null,
      context: 'other',
      note: null,
      predicted_value: null,
      unit: 'kg',
      meta: { ...prev?.meta, bodyFatPct: fat?.pct ?? null, source: 'fitbit', tz: prev?.meta.tz ?? tz },
      updated_at: new Date().toISOString(),
      deleted_at: null,
    })
  }
  return out
}

export const formatSleep = (min: number) => {
  const m = Math.round(min)
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/**
 * How many days back an import should reach: from the last day already imported (so a week or two
 * away gets filled in), at least `min` days (recent days are still filling in), at most 90.
 */
export function catchUpDays(lastDay: string | null, today: string, opts: { min: number; first: number; max?: number }): number {
  if (!lastDay) return opts.first
  const gap = Math.round((Date.parse(`${today}T12:00:00`) - Date.parse(`${lastDay}T12:00:00`)) / 86_400_000) + 1
  return Math.min(opts.max ?? 90, Math.max(opts.min, gap))
}
