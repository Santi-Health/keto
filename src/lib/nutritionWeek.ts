import { MAX_DEFICIT_SHARE } from './coach'
import { shiftDay } from './goalPlan'

/**
 * Days on target for the deficit and each macro over a run of finished days, the nutrition twin of the weekly
 * sets card. A day counts when food was logged and it hit the goal; a refeed day counts for deficit and carbs.
 */

export interface NutritionDay {
  day: string
  /** Food was logged that day. */
  logged: boolean
  refeed: boolean
  /** Burned minus eaten. */
  deficit: number
  burned: number
  kcal: number
  protein: number
  netCarbs: number
  fat: number
}

export interface NutritionGoals {
  proteinG: number
  netCarbsG: number
  /** Minimum fat; the fat row is left out when unknown. */
  fatMinG: number | null
}

export interface NutritionRow {
  key: 'deficit' | 'protein' | 'netCarbs' | 'fat'
  label: string
  /** Average over the logged days, rounded; null with nothing logged. */
  avg: number | null
  unit: string
  goal: string
  hits: number
  days: number
  /** Days needed for the row to count as met: 5 of 7. */
  need: number
  /** Hit days by how long ago they were (index 0 = the last day of the window). */
  byAge: number[]
}

/** Below this the deficit barely moves fat; above the cap it starts costing muscle (the same lines Coach uses). */
export const DEFICIT_MIN = 250
export const deficitMax = (burned: number) => Math.max(burned * MAX_DEFICIT_SHARE, 750)
/** Protein within 10% of the target counts. */
const PROTEIN_SHARE = 0.9
const NEED_SHARE = 5 / 7

const hit = {
  deficit: (d: NutritionDay) => d.logged && (d.refeed || (d.deficit >= DEFICIT_MIN && d.deficit <= deficitMax(d.burned))),
  protein: (d: NutritionDay, g: NutritionGoals) => d.logged && d.protein >= g.proteinG * PROTEIN_SHARE,
  netCarbs: (d: NutritionDay, g: NutritionGoals) => d.logged && (d.refeed || d.netCarbs <= g.netCarbsG),
  fat: (d: NutritionDay, g: NutritionGoals) => d.logged && g.fatMinG != null && d.fat >= g.fatMinG,
}

/** One row per goal for `days` (oldest first); ages count back from the last one. */
export function nutritionRows(days: NutritionDay[], g: NutritionGoals): NutritionRow[] {
  const logged = days.filter((d) => d.logged)
  const avg = (f: (d: NutritionDay) => number) => (logged.length ? Math.round(logged.reduce((s, d) => s + f(d), 0) / logged.length) : null)
  const need = Math.ceil(days.length * NEED_SHARE - 1e-9)
  const row = (key: NutritionRow['key'], label: string, unit: string, goal: string, value: (d: NutritionDay) => number, ok: (d: NutritionDay) => boolean): NutritionRow => {
    const byAge = days.map(() => 0)
    days.forEach((d, i) => {
      if (ok(d)) byAge[days.length - 1 - i] = 1
    })
    return { key, label, avg: avg(value), unit, goal, hits: byAge.reduce((a, b) => a + b, 0), days: days.length, need, byAge }
  }
  const rows = [
    row('deficit', 'Deficit', 'kcal', `${DEFICIT_MIN}–${Math.round(deficitMax(avg((d) => d.burned) ?? 0) / 10) * 10}`, (d) => d.deficit, hit.deficit),
    row('protein', 'Protein', 'g', `${Math.round(g.proteinG * PROTEIN_SHARE)}+`, (d) => d.protein, (d) => hit.protein(d, g)),
    row('netCarbs', 'Net carbs', 'g', `≤ ${g.netCarbsG}`, (d) => d.netCarbs, (d) => hit.netCarbs(d, g)),
  ]
  if (g.fatMinG != null) rows.push(row('fat', 'Fat', 'g', `${g.fatMinG}+`, (d) => d.fat, (d) => hit.fat(d, g)))
  return rows
}

/** The finished days a window covers: the 7 days before today, or up to and including a past day being viewed. */
export function windowDays(viewDay: string, today: string, n = 7): string[] {
  const end = viewDay >= today ? shiftDay(today, -1) : viewDay
  return Array.from({ length: n }, (_, i) => shiftDay(end, i - (n - 1)))
}

export type NutritionVerdict = 'good' | 'close' | 'behind'

/** Every row met is good; all but one met (or 80% of the target days overall) is close; else behind. */
export function judgeNutrition(rows: NutritionRow[]): { verdict: NutritionVerdict; met: number } {
  const met = rows.filter((r) => r.hits >= r.need).length
  const share = rows.reduce((s, r) => s + Math.min(r.hits, r.need), 0) / Math.max(1, rows.reduce((s, r) => s + r.need, 0))
  return { verdict: met === rows.length ? 'good' : met >= rows.length - 1 || share >= 0.8 ? 'close' : 'behind', met }
}

/**
 * A plan week's verdict: ✓ fat at or under the week's target and every goal met; ◐ on track but some goals short,
 * or fat within half a pound of the target; ✗ further behind.
 */
export function planWeekVerdict(aheadLb: number, allGoalsMet: boolean): NutritionVerdict {
  if (aheadLb < -0.5) return 'behind'
  return aheadLb >= -0.3 && allGoalsMet ? 'good' : 'close'
}
