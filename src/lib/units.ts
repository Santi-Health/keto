/** A named portion with its weight, e.g. "1 egg" = 50 g. */
export interface UnitConversion {
  unit: string
  grams: number
}

export const BASE_UNITS = ['g', 'oz', 'ml', 'fl oz', 'cup', 'tbsp', 'tsp'] as const

export const GRAMS_PER_OZ = 28.3495
const ML_PER = { ml: 1, 'fl oz': 29.5735, cup: 236.588, tbsp: 14.7868, tsp: 4.92892 } as const

export interface FoodPortions {
  unitConversions: UnitConversion[]
  /** g per ml; defaults to 1 (water) when unknown. */
  density?: number
}

/** All units a food can be logged in, food-specific portions first. */
export function unitsFor(food: FoodPortions): string[] {
  const own = food.unitConversions.map((c) => c.unit)
  return [...own, ...BASE_UNITS.filter((u) => !own.includes(u))]
}

export interface GramsResult {
  grams: number
  /** True when a volume was converted assuming the density of water. */
  approximate: boolean
}

export function toGrams(food: FoodPortions, amount: number, unit: string): GramsResult {
  const own = food.unitConversions.find((c) => c.unit === unit)
  if (own) return { grams: amount * own.grams, approximate: false }
  if (unit === 'g') return { grams: amount, approximate: false }
  if (unit === 'oz') return { grams: amount * GRAMS_PER_OZ, approximate: false }
  if (unit in ML_PER) {
    // A food-specific cup measure is better than assuming water density.
    const cup = food.unitConversions.find((c) => /^1 cup\b/i.test(c.unit))
    const ml = amount * ML_PER[unit as keyof typeof ML_PER]
    if (cup) return { grams: (ml / ML_PER.cup) * cup.grams, approximate: false }
    return { grams: ml * (food.density ?? 1), approximate: food.density == null }
  }
  throw new Error(`Unknown unit "${unit}"`)
}

/** "150 g", "2 oz", or "2.5 × 1 serving (2 oz)" for named portions. */
export function formatAmount(amount: number, unit: string): string {
  const n = Number(amount.toFixed(2))
  return (BASE_UNITS as readonly string[]).includes(unit) ? `${n} ${unit}` : `${n} × ${unit}`
}
