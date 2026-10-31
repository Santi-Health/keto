import { MGDL_PER_MMOL_GLUCOSE, gki } from './nutrition'
import type { Reading as CgmPoint } from './cgm'
import type { LogEntry } from './foods'

/**
 * Things measured by hand: finger-stick glucose, blood ketones (BHB), urine strips,
 * weight, occasional lab results and water. One synced table holds them all.
 */
export type ReadingKind = 'glucose' | 'blood_ketone' | 'urine_ketone' | 'weight' | 'lab' | 'water' | 'body_scan'
export type UrineLevel = 'negative' | 'trace' | 'small' | 'moderate' | 'large'
export type ReadingContext = 'fasted' | 'pre_meal' | 'post_meal_1h' | 'post_meal_2h' | 'post_exercise' | 'bedtime' | 'other'

export interface ReadingMeta {
  /** Weight readings: optional body fat %. */
  bodyFatPct?: number | null
  /** Lab readings: test name, e.g. HbA1c. */
  test?: string
  /** The time zone it was logged in. */
  tz?: string
  /** Where an imported reading came from, e.g. fitbit. */
  source?: string
  /** Body scan (DEXA) results; value holds total body fat %. */
  scan?: BodyScan
  /** Water readings: which drink, e.g. sparkling_water. */
  drink?: string
  /** Ketosis estimate range at the time, kept for learning. */
  predictedLow?: number
  predictedHigh?: number
}

/** A DEXA body composition scan (e.g. BodySpec). Masses in kg; regional values are fat %. */
export interface BodyScan {
  provider?: string
  totalMassKg?: number
  bodyFatPct?: number
  fatMassKg?: number
  leanMassKg?: number
  boneMassKg?: number
  /** Visceral adipose tissue mass. */
  vatMassKg?: number
  vatVolumeIn3?: number
  /** Appendicular lean mass index (arms + legs lean ÷ height²), kg/m². */
  almi?: number
  ffmi?: number
  restingMetabolicRate?: number
  agRatio?: number
  regions?: Partial<Record<'arms' | 'legs' | 'trunk' | 'android' | 'gynoid', number>>
}

export interface ReadingRow {
  id: string
  taken_at: string
  kind: ReadingKind
  /** mg/dL, mmol/L, kg, lab value or oz; null for urine strips. */
  value: number | null
  urine_level: UrineLevel | null
  context: ReadingContext
  note: string | null
  /** Ketosis estimate (mmol/L) when a blood ketone reading was taken. */
  predicted_value: number | null
  unit: string | null
  meta: ReadingMeta
  updated_at: string
  deleted_at: string | null
}

export const READING_KINDS: { value: ReadingKind; label: string }[] = [
  { value: 'blood_ketone', label: 'Ketones' },
  { value: 'glucose', label: 'Glucose' },
  { value: 'urine_ketone', label: 'Urine' },
  { value: 'weight', label: 'Weight' },
  { value: 'lab', label: 'Lab' },
]

export const URINE_LEVELS: { value: UrineLevel; label: string; mgDl: string }[] = [
  { value: 'negative', label: 'Negative', mgDl: '0' },
  { value: 'trace', label: 'Trace', mgDl: '5' },
  { value: 'small', label: 'Small', mgDl: '15' },
  { value: 'moderate', label: 'Moderate', mgDl: '40' },
  { value: 'large', label: 'Large', mgDl: '80+' },
]

export const CONTEXTS: { value: ReadingContext; label: string }[] = [
  { value: 'fasted', label: 'Fasted (morning)' },
  { value: 'pre_meal', label: 'Before a meal' },
  { value: 'post_meal_1h', label: '1 h after a meal' },
  { value: 'post_meal_2h', label: '2 h after a meal' },
  { value: 'post_exercise', label: 'After exercise' },
  { value: 'bedtime', label: 'Bedtime' },
  { value: 'other', label: 'Other' },
]

/** Common lab tests with their usual unit. */
export const LAB_TESTS: { test: string; unit: string }[] = [
  { test: 'HbA1c', unit: '%' },
  { test: 'Fasting glucose', unit: 'mg/dL' },
  { test: 'Fasting insulin', unit: 'µIU/mL' },
  { test: 'Total cholesterol', unit: 'mg/dL' },
  { test: 'LDL', unit: 'mg/dL' },
  { test: 'HDL', unit: 'mg/dL' },
  { test: 'Triglycerides', unit: 'mg/dL' },
  { test: 'ApoB', unit: 'mg/dL' },
  { test: 'hs-CRP', unit: 'mg/L' },
  { test: 'Creatinine', unit: 'mg/dL' },
  { test: 'Uric acid', unit: 'mg/dL' },
]

/** Context guessed from the time of day and what was eaten recently. */
export function guessContext(at: Date, logs: LogEntry[]): ReadingContext {
  const t = at.getTime()
  const last = Math.max(-Infinity, ...logs.map((l) => Date.parse(l.eaten_at)).filter((x) => x <= t))
  const sinceMeal = (t - last) / 3_600_000
  const h = at.getHours()
  if (sinceMeal >= 8 && h >= 4 && h < 11) return 'fasted'
  if (sinceMeal >= 0.75 && sinceMeal < 1.5) return 'post_meal_1h'
  if (sinceMeal >= 1.5 && sinceMeal < 2.5) return 'post_meal_2h'
  if (h >= 21 || h < 2) return 'bedtime'
  return 'other'
}

export interface GkiResult {
  value: number
  glucose: number
  ketones: number
  /** Where the glucose came from. */
  glucoseSource: 'finger-stick' | 'CGM'
}

const NEAR_MS = 30 * 60_000

/**
 * GKI for a blood ketone reading, using a finger-stick glucose within 30 minutes,
 * or else the closest CGM value within 15 minutes.
 */
export function gkiFor(ketone: ReadingRow, readings: ReadingRow[], cgm: CgmPoint[] = []): GkiResult | null {
  if (ketone.kind !== 'blood_ketone' || ketone.value == null || ketone.value <= 0) return null
  const t = Date.parse(ketone.taken_at)
  const stick = readings
    .filter((r) => r.kind === 'glucose' && r.value != null && Math.abs(Date.parse(r.taken_at) - t) <= NEAR_MS)
    .sort((a, b) => Math.abs(Date.parse(a.taken_at) - t) - Math.abs(Date.parse(b.taken_at) - t))[0]
  let glucose = stick?.value ?? null
  let glucoseSource: GkiResult['glucoseSource'] = 'finger-stick'
  if (glucose == null) {
    const near = cgm.filter((p) => Math.abs(p.t - t) <= NEAR_MS / 2).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0]
    if (!near) return null
    glucose = near.v
    glucoseSource = 'CGM'
  }
  const value = gki(glucose, ketone.value)
  return value == null ? null : { value: Math.round(value * 10) / 10, glucose, ketones: ketone.value, glucoseSource }
}

/** Commonly cited GKI bands (general guidance, from therapeutic-ketosis literature). */
export function gkiBand(v: number): string {
  if (v < 1) return 'very high ketosis (therapeutic range)'
  if (v < 3) return 'high ketosis'
  if (v < 6) return 'moderate ketosis'
  if (v < 9) return 'low ketosis'
  return 'not in ketosis'
}

export function ketoneBand(mmol: number): string {
  if (mmol < 0.5) return 'not in ketosis'
  if (mmol < 1.5) return 'light–moderate ketosis'
  if (mmol < 3) return 'deep ketosis'
  return 'very high; usually only with long fasts'
}

/** Gentle flag for finger-stick glucose outside the usual range. */
export function glucoseFlag(r: Pick<ReadingRow, 'value' | 'context'>): string | null {
  if (r.value == null) return null
  if (r.value < 70) return 'Below 70 mg/dL. If you feel shaky or unwell, eat something with fast carbs and recheck.'
  const fasted = r.context === 'fasted'
  if (fasted && r.value >= 100)
    return r.value >= 126
      ? 'Fasting glucose of 126+ is high. If it repeats, talk to your doctor.'
      : 'Fasting glucose of 100–125 is in the prediabetes range. Worth watching the trend.'
  if (!fasted && r.value > 180) return 'Above 180 mg/dL. If this keeps happening, talk to your doctor.'
  return null
}

export const KG_PER_LB = 0.45359237
export const glucoseMmol = (mgDl: number) => mgDl / MGDL_PER_MMOL_GLUCOSE

export const latest = (rows: ReadingRow[], kind: ReadingKind) =>
  rows.filter((r) => r.kind === kind).sort((a, b) => b.taken_at.localeCompare(a.taken_at))[0] ?? null

/** Hours since the last logged food, or null if nothing is logged. */
export function hoursSinceFood(logs: LogEntry[], now = Date.now()): number | null {
  const times = logs.map((l) => Date.parse(l.eaten_at)).filter((t) => t <= now)
  return times.length ? (now - Math.max(...times)) / 3_600_000 : null
}

/** Weight change per week over the last `days`, by least squares; null with fewer than 3 points. */
export function weightTrend(rows: ReadingRow[], days = 28, now = Date.now()): number | null {
  const pts = rows
    .filter((r) => r.kind === 'weight' && r.value != null && Date.parse(r.taken_at) >= now - days * 86_400_000)
    .map((r) => ({ x: Date.parse(r.taken_at) / (7 * 86_400_000), y: r.value as number }))
  if (pts.length < 3) return null
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0)
  if (sxx === 0) return null
  return pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx
}
