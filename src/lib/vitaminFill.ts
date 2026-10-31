import { fetchUsdaFood, searchUsda } from './foodApi'
import type { Food, LogEntry, NewFood } from './foods'
import { MICROS, type MicroKey } from './micros'
import type { Nutrients } from './nutrients'
import { bestIngredientMatch, computeRecipe, isOffTarget } from './recipes'

/**
 * Fills in vitamins and trace minerals for foods saved before they were tracked, and for label foods
 * that never had them. USDA foods get their exact values; label and hand-entered foods borrow them
 * from the closest plain USDA food ("egg whites, raw"), marked as estimated. Values that are already
 * there (e.g. calcium from a label) are never overwritten.
 */

const KEYS = MICROS.map((m) => m.key) as MicroKey[]
/** Vitamins that say "this food has vitamin data" (calcium and iron alone are common on labels). */
const MARKERS: MicroKey[] = ['vitCMg', 'vitDUg', 'b12Ug', 'folateUg', 'vitAUg', 'cholineMg', 'zincMg']

export const hasVitamins = (n: Nutrients) => MARKERS.some((k) => n[k] != null)

/** Only the missing micronutrients from `from`, per 100 g. */
function missingMicros(target: Nutrients, from: Nutrients): Nutrients {
  const out: Nutrients = {}
  for (const k of KEYS) if (target[k] == null && from[k] != null) out[k] = from[k]
  return out
}

/** "Kirkland Signature Egg Whites (Kirkland)" → "egg whites", for matching a plain USDA food. */
export function plainName(f: Pick<Food, 'name' | 'brand'>): string {
  let n = f.name.replace(/\(.*?\)/g, ' ')
  if (f.brand) n = n.replace(new RegExp(f.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ')
  n = n.replace(/\b(kirkland signature|kirkland|great value|signature|organic|original|fairlife|ultra-filtered|ultra filtered|extra large|large)\b/gi, ' ')
  n = n.replace(/\s+/g, ' ').trim().toLowerCase()
  // USDA's wording for plain milk.
  if (/\bmilk\b/.test(n) && /\b(non-?fat|fat-?free|skim)\b/.test(n)) return 'milk nonfat fluid'
  return n
}

/**
 * Made products (shakes, bars, breads, keto or protein items) aren't like any plain USDA food, so their
 * vitamins aren't borrowed; they keep what their label says.
 */
const MADE_PRODUCT = /\b(shake|bar|bars|bread|tortilla|wrap|keto|protein|powder|supplement|cereal|cracker|chips|cookie)\b/i

const isDrink = (f: Food) => !!f.meta.externalId?.startsWith('drink:') && !f.meta.externalId.startsWith('drink:milk')

/** Foods still waiting for vitamins (not recipes, which are rebuilt from their ingredients). */
export const needsVitamins = (f: Food) => !f.deleted_at && f.source !== 'recipe' && !isDrink(f) && !f.meta.vitaminsChecked && !hasVitamins(f.per_100g)

/** Looks up vitamins for one food. Always returns the food marked as checked, so it isn't retried. */
export async function fillFood(f: Food): Promise<Food> {
  const ext = f.meta.externalId
  let add: Nutrients = {}
  let from: string | undefined
  let estimated = false
  if (ext?.startsWith('usda:')) {
    add = missingMicros(f.per_100g, (await fetchUsdaFood(ext.slice(5))).per_100g)
    from = 'USDA'
  } else if (!MADE_PRODUCT.test(f.name)) {
    const q = plainName(f)
    if (q) {
      const results = await searchUsda(q, undefined, { ingredients: true })
      const match = bestIngredientMatch(q, results.filter((r) => !isOffTarget(q, r.name)))
      if (match) {
        add = missingMicros(f.per_100g, match.per_100g)
        from = match.name
        estimated = true
      }
    }
  }
  const got = Object.keys(add).length > 0
  return {
    ...f,
    per_100g: { ...f.per_100g, ...add },
    fields_estimated: got && estimated ? [...new Set([...f.fields_estimated, 'vitamins'])] : f.fields_estimated,
    meta: { ...f.meta, vitaminsChecked: true, ...(got && from ? { vitaminsFrom: from } : {}) },
  }
}

/** Rebuilds a recipe's vitamins from its ingredients' current values. */
export function fillRecipe(recipe: Food, foodById: Record<string, Food>): Food | null {
  const r = recipe.meta.recipe
  if (!r) return null
  const ingredients = r.ingredients.map((i) => {
    const current = i.foodId ? foodById[i.foodId] : undefined
    const food: NewFood = current ? { ...i.food, per_100g: { ...current.per_100g, ...i.food.per_100g, ...missingMicros(i.food.per_100g, current.per_100g) } } : i.food
    return { ...i, food }
  })
  const add = missingMicros(recipe.per_100g, computeRecipe(ingredients, r.servings, r.cookedWeightG).per100g)
  if (!Object.keys(add).length) return null
  return { ...recipe, per_100g: { ...recipe.per_100g, ...add }, meta: { ...recipe.meta, recipe: { ...r, ingredients } } }
}

/** A log entry with the vitamins its food now has, for the grams eaten (other values untouched). */
export function fillLog(l: LogEntry, food: Food | undefined): LogEntry | null {
  if (!food || hasVitamins(l.nutrients) || !hasVitamins(food.per_100g)) return null
  const add: Nutrients = {}
  for (const k of KEYS) if (l.nutrients[k] == null && food.per_100g[k] != null) add[k] = (food.per_100g[k]! * l.grams) / 100
  return Object.keys(add).length ? { ...l, nutrients: { ...l.nutrients, ...add } } : null
}
