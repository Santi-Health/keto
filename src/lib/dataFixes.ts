import { completeNutrients, type Food, type LogEntry } from './foods'
import type { Nutrients } from './nutrients'

/**
 * One-time corrections to foods saved with wrong numbers, found by checking calories against macros and
 * glucose against the food log (Nov 17, 2026). Each fix applies only while the wrong value is still there,
 * so a food you've since corrected is left alone, and the past logs of a fixed food are recomputed.
 */

export const DATA_FIX = 'data-2026-11-17'

interface FoodFix {
  match: (f: Food) => boolean
  /** The wrong value is still there. */
  broken: (f: Food) => boolean
  fix: (f: Food) => Food['per_100g']
  /** Fields that change on past logs; the rest (calories included) stay as they were logged. */
  fields: (keyof Nutrients)[]
  why: string
}

const named = (name: RegExp, brand?: RegExp) => (f: Food) => name.test(f.name) && (!brand || brand.test(f.brand ?? ''))

const FOOD_FIXES: FoodFix[] = [
  {
    // 50 g of fiber in 28.6 g of carbs made its net carbs 0, though it's 32% sugar. Seaweed salad has about
    // 3.6 g of fiber per 100 g, so about 25 g net.
    match: named(/seaweed salad/i),
    broken: (f) => (f.per_100g.fiber ?? 0) > (f.per_100g.carbs ?? 0),
    fix: (f) => ({ ...f.per_100g, fiber: 3.6 }),
    fields: ['fiber', 'netCarbs'],
    why: 'Seaweed salad: fiber was more than its carbs, so net carbs showed 0; now about 25 g per 100 g.',
  },
  {
    // 210 g of fat per 100 g: the label's 2.1 with the decimal lost. Its calories were right.
    match: named(/pink salmon/i, /chicken of the sea/i),
    broken: (f) => (f.per_100g.fat ?? 0) > 50,
    fix: (f) => ({ ...f.per_100g, fat: 2.1 }),
    fields: ['fat'],
    why: 'Pink salmon pouch: fat was 210 g per 100 g; now 2.1 g.',
  },
  {
    // Half the fat of butter (11 g per 14 g tablespoon is 78.6 g per 100 g).
    match: named(/irish butter/i, /kerrygold/i),
    broken: (f) => (f.per_100g.fat ?? 0) < 60,
    fix: (f) => ({ ...f.per_100g, fat: 78.6 }),
    fields: ['fat'],
    why: 'Kerrygold butter: fat was 39.3 g per 100 g; now 78.6 g.',
  },
]

/** Friday Nov 6: glucose rose 55 to 139 around 9 PM with nothing logged after 3:42 PM. */
export const MISSED_DINNER: Omit<LogEntry, 'updated_at' | 'deleted_at'> = {
  id: '5d0c7a3e-91b2-4f68-a4d1-6e2b8f0c3a17',
  // 7:30 PM Pacific.
  eaten_at: '2026-11-07T03:30:00.000Z',
  meal: 'dinner',
  food_id: null,
  food_name: 'High-carb dinner (estimated, not logged at the time)',
  amount: 1,
  unit: 'meal',
  grams: 0,
  nutrients: { kcal: 1000, protein: 35, fat: 40, carbs: 128, fiber: 6, netCarbs: 122 },
  meta: { estimated: true, tz: 'America/Los_Angeles' },
}
// 5 PM to midnight Pacific.
const MISSED_FROM = Date.parse('2026-11-07T01:00:00Z')
const MISSED_TO = Date.parse('2026-11-07T08:00:00Z')

export interface DataFixResult {
  foods: Food[]
  logs: LogEntry[]
  notes: string[]
}

export function dataFixes(foods: Food[], logs: LogEntry[], now = new Date().toISOString()): DataFixResult {
  const out: DataFixResult = { foods: [], logs: [], notes: [] }
  for (const ff of FOOD_FIXES) {
    for (const f of foods) {
      if (f.deleted_at || !ff.match(f) || !ff.broken(f)) continue
      const fixed: Food = { ...f, per_100g: completeNutrients(ff.fix(f), f.carbs_exclude_fiber, f.meta.sugarAlcoholType), updated_at: now }
      out.foods.push(fixed)
      out.notes.push(ff.why)
      for (const l of logs) {
        if (l.deleted_at || l.food_id !== f.id || !l.grams) continue
        const nutrients = { ...l.nutrients }
        for (const k of ff.fields) (nutrients as Record<string, number>)[k] = (((fixed.per_100g[k] as number | undefined) ?? 0) * l.grams) / 100
        out.logs.push({ ...l, nutrients, updated_at: now })
      }
    }
  }
  // The dinner, unless it (or any dinner that evening) is already there.
  const hasDinner = logs.some((l) => !l.deleted_at && (l.id === MISSED_DINNER.id || (Date.parse(l.eaten_at) > MISSED_FROM && Date.parse(l.eaten_at) < MISSED_TO)))
  if (!hasDinner && !logs.some((l) => l.id === MISSED_DINNER.id)) {
    out.logs.push({ ...MISSED_DINNER, updated_at: now, deleted_at: null })
    out.notes.push('Added an estimated 1,000 kcal high-carb dinner on Fri Nov 6 at 7:30 PM.')
  }
  return out
}
