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

export type WeekVerdict = 'good' | 'close' | 'behind'

/** ✓ every muscle group and both food goals met; ✗ under 5 groups and no food goal; ◐ anything between. */
export function judgePlanWeek(groupsMet: number, groups: number, foodMet: number, foodGoals = 2): WeekVerdict {
  if (groupsMet >= groups && foodMet >= foodGoals) return 'good'
  if (groupsMet < 5 && foodMet === 0) return 'behind'
  return 'close'
}
