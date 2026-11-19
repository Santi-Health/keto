import { shiftDay } from './goalPlan'

/**
 * Food over a run of finished days, judged on the two things that matter for the plan: an average deficit of 500+
 * kcal a day and an average of 150+ g of protein. The nutrition twin of the weekly sets card.
 */

export interface NutritionDay {
  day: string
  /** Food was logged that day. */
  logged: boolean
  refeed: boolean
  /** Burned minus eaten. */
  deficit: number
  protein: number
}

export const FOOD_GOALS = { deficitKcal: 500, proteinG: 150 }

export interface FoodRow {
  key: 'deficit' | 'protein'
  label: string
  unit: string
  /** Average a day over the days that count; null with none. */
  avg: number | null
  goal: number
  /** Days the average is over (logged days; a planned refeed day is left out of the deficit). */
  days: number
  /** Each day's share of the average, by how long ago it was (index 0 = the last day of the window). */
  byAge: number[]
  met: boolean
}

/** One row per goal for `days` (oldest first). */
export function foodRows(days: NutritionDay[]): FoodRow[] {
  const row = (key: FoodRow['key'], label: string, unit: string, goal: number, value: (d: NutritionDay) => number, counts: (d: NutritionDay) => boolean): FoodRow => {
    const used = days.filter(counts)
    const byAge = days.map(() => 0)
    days.forEach((d, i) => {
      if (counts(d)) byAge[days.length - 1 - i] = Math.max(0, value(d)) / used.length
    })
    const avg = used.length ? Math.round(used.reduce((s, d) => s + value(d), 0) / used.length) : null
    return { key, label, unit, avg, goal, days: used.length, byAge, met: avg != null && avg >= goal }
  }
  return [
    row('deficit', 'Deficit', 'kcal', FOOD_GOALS.deficitKcal, (d) => d.deficit, (d) => d.logged && !d.refeed),
    row('protein', 'Protein', 'g', FOOD_GOALS.proteinG, (d) => d.protein, (d) => d.logged),
  ]
}

/** The finished days a window covers: the 7 days before today, or up to and including a past day being viewed. */
export function windowDays(viewDay: string, today: string, n = 7): string[] {
  const end = viewDay >= today ? shiftDay(today, -1) : viewDay
  return Array.from({ length: n }, (_, i) => shiftDay(end, i - (n - 1)))
}

/** Green: met. Yellow: short by 10% or less. Red: short by more. Grey: nothing to judge yet. */
export type Light = 'green' | 'yellow' | 'red' | 'none'

const lightOf = (share: number | null): Light => (share == null ? 'none' : share >= 1 - 1e-9 ? 'green' : share >= 0.9 ? 'yellow' : 'red')

/** Lifting: the share of the week's target sets done, each group capped at its own target (so extra chest can't cover legs). */
export function liftLight(groups: { sets: number; target: number }[], marked = false): Light {
  if (marked) return 'green'
  const target = groups.reduce((s, g) => s + g.target, 0)
  return lightOf(target ? groups.reduce((s, g) => s + Math.min(g.sets, g.target), 0) / target : null)
}

/** Food: the weaker of the two goals, as a share of its goal (deficit average over 500, protein over 150). */
export function foodLight(rows: FoodRow[]): Light {
  const shares = rows.filter((r) => r.avg != null).map((r) => Math.max(0, r.avg!) / r.goal)
  return lightOf(shares.length ? Math.min(...shares) : null)
}
