import { localDate } from './targets'

/** [minute of the local day, mg/dL] */
export type CgmPoint = [number, number]

/** Row shape of the `cgm_days` table. */
export interface CgmDay {
  id: string // YYYY-MM-DD
  day: string
  points: CgmPoint[]
  source: string
  meta: Record<string, unknown>
  updated_at: string
  deleted_at: string | null
}

export interface Reading {
  /** Epoch ms */
  t: number
  v: number
}

const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes()

/** Groups timestamped readings into local days and merges them with what's stored (by minute). */
export function mergeIntoDays(readings: Reading[], existing: Record<string, CgmDay>, now = new Date().toISOString()): CgmDay[] {
  const byDay = new Map<string, Map<number, number>>()
  for (const r of readings) {
    const d = new Date(r.t)
    const day = localDate(d)
    if (!byDay.has(day)) byDay.set(day, new Map((existing[day]?.points ?? []).map(([m, v]) => [m, v])))
    byDay.get(day)!.set(minuteOfDay(d), Math.round(r.v))
  }
  return [...byDay.entries()].map(([day, pts]) => ({
    id: day,
    day,
    points: [...pts.entries()].sort((a, b) => a[0] - b[0]) as CgmPoint[],
    source: 'google_health',
    meta: existing[day]?.meta ?? {},
    updated_at: now,
    deleted_at: null,
  }))
}

/** Readings for a set of days as absolute times, sorted. */
export function toReadings(days: CgmDay[]): Reading[] {
  const out: Reading[] = []
  for (const d of days) {
    const base = new Date(`${d.day}T00:00:00`).getTime()
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
