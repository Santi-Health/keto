import { dayIn, deviceTz, midnightIn } from './time'

/** [minutes since the day's local midnight (real elapsed time, so 0–1499 on a 25-hour day), mg/dL] */
export type CgmPoint = [number, number]

/** Row shape of the `cgm_days` table. */
export interface CgmDay {
  id: string // YYYY-MM-DD
  day: string
  points: CgmPoint[]
  source: string
  /** startMs: the local midnight as a UTC instant; tz: the zone the day was filed in. Absent on older rows. */
  meta: { startMs?: number; tz?: string } & Record<string, unknown>
  updated_at: string
  deleted_at: string | null
}

export interface Reading {
  /** Epoch ms */
  t: number
  v: number
}

/** When a stored day starts. Older rows (no startMs) used wall-clock minutes from the phone's midnight. */
const dayStart = (d: CgmDay) => (typeof d.meta?.startMs === 'number' ? d.meta.startMs : new Date(`${d.day}T00:00:00`).getTime())

/**
 * Files timestamped readings under their local day in `tz` and merges them with what's stored.
 * Minutes are counted from that day's real midnight, so the repeated 1 AM hour when clocks fall back
 * doesn't overwrite itself, and the missing hour in spring doesn't shift the rest of the day.
 * Older rows are converted on the way through.
 */
export function mergeIntoDays(readings: Reading[], existing: Record<string, CgmDay>, tz = deviceTz(), now = new Date().toISOString()): CgmDay[] {
  const byDay = new Map<string, Map<number, number>>()
  const starts = new Map<string, number>()
  const add = (r: Reading) => {
    const day = dayIn(tz, r.t)
    if (!starts.has(day)) starts.set(day, midnightIn(tz, day))
    if (!byDay.has(day)) {
      byDay.set(day, new Map())
      // Bring in what's already stored for the day, re-filed the same way.
      if (existing[day]) for (const old of toReadings([existing[day]])) byDay.get(day)!.set(Math.round((old.t - starts.get(day)!) / 60_000), old.v)
    }
    byDay.get(day)!.set(Math.round((r.t - starts.get(day)!) / 60_000), Math.round(r.v))
  }
  for (const r of readings) add(r)
  return [...byDay.entries()].map(([day, pts]) => ({
    id: day,
    day,
    points: [...pts.entries()].sort((a, b) => a[0] - b[0]) as CgmPoint[],
    source: 'google_health',
    meta: { ...existing[day]?.meta, startMs: starts.get(day)!, tz },
    updated_at: now,
    deleted_at: null,
  }))
}

/** Readings for a set of days as absolute times, sorted. */
export function toReadings(days: CgmDay[]): Reading[] {
  const out: Reading[] = []
  for (const d of days) {
    const base = dayStart(d)
    for (const [m, v] of d.points) out.push({ t: base + m * 60_000, v })
  }
  return out.sort((a, b) => a.t - b.t)
}

/** Pulls { time, mg/dL } out of a Google Health blood-glucose data point, tolerating field nesting. */
export function parseGlucosePoint(p: unknown): Reading | null {
  let value: number | null = null
  let time: string | null = null
  const walk = (o: unknown) => {
    if (!o || typeof o !== 'object') return
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k === 'bloodGlucoseMilligramsPerDeciliter' && typeof v === 'number') value = v
      else if (k === 'bloodGlucoseMillimolesPerLiter' && typeof v === 'number' && value == null) value = v * 18
      else if ((k === 'physicalTime' || k === 'sampleTime' || k === 'time') && typeof v === 'string' && !time) time = v
      else if (typeof v === 'object') walk(v)
    }
  }
  walk(p)
  if (value == null || !time || Number.isNaN(Date.parse(time))) return null
  return { t: Date.parse(time), v: value }
}
