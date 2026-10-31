import { KG_PER_LB, type BodyScan, type ReadingRow } from './readings'

/**
 * DEXA body composition scans (BodySpec and similar). Stored as readings of kind body_scan:
 * value = total body fat %, details in meta.scan (masses in kg).
 */

export const SCAN_PROMPT = `I'm attaching my DEXA body composition scan report (BodySpec). Read it and reply with ONLY one JSON object, no other text:
{
  "date": "YYYY-MM-DD",
  "provider": "BodySpec",
  "total_mass_lb": 0,
  "body_fat_pct": 0,
  "fat_mass_lb": 0,
  "lean_mass_lb": 0,
  "bone_mass_lb": 0,
  "vat_mass_lb": null,
  "vat_volume_in3": null,
  "almi": null,
  "ffmi": null,
  "resting_metabolic_rate": null,
  "ag_ratio": null,
  "regional_fat_pct": { "arms": null, "legs": null, "trunk": null, "android": null, "gynoid": null }
}
Use the numbers for the most recent scan in the report. "lean_mass_lb" is lean tissue without bone (BodySpec's "Lean Tissue"); "bone_mass_lb" is bone mineral content. Use null for anything the report doesn't show.`

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined
}
const lbToKg = (v: unknown) => {
  const n = num(v)
  return n == null ? undefined : Math.round(n * KG_PER_LB * 1000) / 1000
}

/** Reads Claude's JSON for a scan; returns the scan and its date. */
export function parseScanJson(text: string): { date: string | null; scan: BodyScan } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error("That doesn't look like JSON. Paste Claude's whole reply, starting with {.")
  let j: Record<string, unknown>
  try {
    j = JSON.parse(body.slice(start, end + 1))
  } catch {
    throw new Error('The JSON is incomplete or has a typo. Ask Claude to resend it as one valid JSON object.')
  }
  const r = (j.regional_fat_pct ?? {}) as Record<string, unknown>
  const scan: BodyScan = {
    provider: typeof j.provider === 'string' ? j.provider : 'BodySpec',
    totalMassKg: lbToKg(j.total_mass_lb),
    bodyFatPct: num(j.body_fat_pct),
    fatMassKg: lbToKg(j.fat_mass_lb),
    leanMassKg: lbToKg(j.lean_mass_lb),
    boneMassKg: lbToKg(j.bone_mass_lb),
    vatMassKg: lbToKg(j.vat_mass_lb),
    vatVolumeIn3: num(j.vat_volume_in3),
    almi: num(j.almi),
    ffmi: num(j.ffmi),
    restingMetabolicRate: num(j.resting_metabolic_rate),
    agRatio: num(j.ag_ratio),
    regions: { arms: num(r.arms), legs: num(r.legs), trunk: num(r.trunk), android: num(r.android), gynoid: num(r.gynoid) },
  }
  if (scan.bodyFatPct == null) throw new Error('No body fat % found. Ask Claude to include "body_fat_pct".')
  const date = typeof j.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null
  return { date, scan }
}

export const scansOf = (readings: ReadingRow[]) =>
  readings.filter((r) => r.kind === 'body_scan' && r.meta.scan).sort((a, b) => a.taken_at.localeCompare(b.taken_at))

export interface ScanChange {
  label: string
  unit: string
  latest: number
  sincePrevious: number | null
  sinceFirst: number | null
  /** Whether a drop is good news (fat) or bad news (lean, bone). */
  lowerIsBetter: boolean
}

const METRICS: { label: string; unit: string; get: (s: BodyScan) => number | undefined; lb?: boolean; lowerIsBetter: boolean }[] = [
  { label: 'Body fat', unit: '%', get: (s) => s.bodyFatPct, lowerIsBetter: true },
  { label: 'Fat mass', unit: 'lb', get: (s) => s.fatMassKg, lb: true, lowerIsBetter: true },
  { label: 'Lean mass', unit: 'lb', get: (s) => s.leanMassKg, lb: true, lowerIsBetter: false },
  { label: 'Visceral fat', unit: 'lb', get: (s) => s.vatMassKg, lb: true, lowerIsBetter: true },
  { label: 'Bone', unit: 'lb', get: (s) => s.boneMassKg, lb: true, lowerIsBetter: false },
  { label: 'Weight', unit: 'lb', get: (s) => s.totalMassKg, lb: true, lowerIsBetter: true },
]

/** Latest value of each metric with its change since the previous and the first scan. */
export function scanChanges(scans: BodyScan[]): ScanChange[] {
  if (!scans.length) return []
  const conv = (v: number | undefined, lb?: boolean) => {
    if (v == null) return null
    const x = lb ? v / KG_PER_LB : v
    // Small masses like visceral fat (~0.5 lb) keep two decimals.
    const k = Math.abs(x) < 5 ? 100 : 10
    return Math.round(x * k) / k
  }
  const latest = scans[scans.length - 1]
  const prev = scans.length > 1 ? scans[scans.length - 2] : null
  const first = scans.length > 2 ? scans[0] : null
  return METRICS.flatMap((m) => {
    const l = conv(m.get(latest), m.lb)
    if (l == null) return []
    const p = prev ? conv(m.get(prev), m.lb) : null
    const f = first ? conv(m.get(first), m.lb) : null
    return [
      {
        label: m.label,
        unit: m.unit,
        latest: l,
        sincePrevious: p == null ? null : Math.round((l - p) * 100) / 100,
        sinceFirst: f == null ? null : Math.round((l - f) * 100) / 100,
        lowerIsBetter: m.lowerIsBetter,
      },
    ]
  })
}

/** One-line read of the latest change: the "replace fat with muscle" goal. */
export function recompSummary(scans: BodyScan[]): string | null {
  if (scans.length < 2) return null
  const [a, b] = [scans[scans.length - 2], scans[scans.length - 1]]
  if (a.fatMassKg == null || b.fatMassKg == null || a.leanMassKg == null || b.leanMassKg == null) return null
  const fat = (b.fatMassKg - a.fatMassKg) / KG_PER_LB
  const lean = (b.leanMassKg - a.leanMassKg) / KG_PER_LB
  const f = `${fat <= 0 ? 'lost' : 'gained'} ${Math.abs(fat).toFixed(1)} lb of fat`
  const l = `${lean >= 0 ? 'gained' : 'lost'} ${Math.abs(lean).toFixed(1)} lb of lean mass`
  const verdict =
    fat < 0 && lean >= 0
      ? 'That is recomposition: fat down while muscle holds or grows.'
      : fat < 0 && lean < 0
        ? lean / fat > 0.25
          ? 'More than a quarter of the loss was lean mass: keep protein high and lift 2–3 times a week.'
          : 'Most of the loss was fat.'
        : fat >= 0 && lean > 0
          ? 'Gaining muscle with some fat; fine if you are building.'
          : 'Fat went up and lean mass went down; check calories, protein and lifting.'
  return `Since your previous scan you ${f} and ${l}. ${verdict} DEXA can swing ±1 lb of lean mass with hydration, so look at the trend over several scans.`
}
