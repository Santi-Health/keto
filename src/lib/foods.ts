import { netCarbs, type SugarAlcoholType } from './nutrition'
import { kcalFromMacros, scaleNutrients, type Nutrients } from './nutrients'
import { toGrams, type UnitConversion } from './units'
import type { RecipeMeta } from './recipes'
import { MERCURY_PPM, type FishSpecies } from './watchlist'

export type FoodSource = 'label_photo' | 'database' | 'ai_estimate' | 'manual' | 'recipe'
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEALS: { value: Meal; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
]

export interface FoodMeta {
  fishSpecies?: FishSpecies | null
  processedMeat?: boolean
  /** Open Food Facts NOVA group; 4 = ultra-processed. */
  novaGroup?: number | null
  additives?: string[]
  /** Artificial sweeteners found in the ingredients. */
  sweeteners?: string[]
  /** Product type known to test high for lead or cadmium. */
  heavyMetalRisk?: boolean
  partiallyHydrogenated?: boolean
  sugarAlcoholType?: SugarAlcoholType
  /** Where the food came from, e.g. "usda:2707152" or "off:3017624010701". */
  externalId?: string
  imageUrl?: string
  lastAmount?: number
  lastUnit?: string
  /** Set on recipes: the ingredients and batch size the nutrition was calculated from. */
  recipe?: RecipeMeta
}

/** Row shape of the `foods` table. */
export interface Food {
  id: string
  name: string
  brand: string | null
  barcode: string | null
  per_100g: Nutrients
  unit_conversions: UnitConversion[]
  ingredients_text: string | null
  keto_notes: string | null
  carbs_exclude_fiber: boolean
  source: FoodSource
  confidence: 'high' | 'medium' | 'low' | null
  fields_estimated: string[]
  favorite: boolean
  use_count: number
  last_used_at: string | null
  meta: FoodMeta
  updated_at: string
  deleted_at: string | null
}

/** Row shape of the `food_logs` table. Nutrients are a snapshot for the portion eaten. */
export interface LogEntry {
  id: string
  eaten_at: string
  meal: Meal
  food_id: string | null
  food_name: string
  amount: number
  unit: string
  grams: number
  nutrients: Nutrients
  meta: { approximate?: boolean; estimated?: boolean }
  updated_at: string
  deleted_at: string | null
}

export type NewFood = Omit<Food, 'id' | 'updated_at' | 'deleted_at' | 'favorite' | 'use_count' | 'last_used_at'>

/** Fills derived values (net carbs, calories) so every saved food is complete. */
export function completeNutrients(n: Nutrients, carbsExcludeFiber: boolean, sugarAlcoholType?: SugarAlcoholType): Nutrients {
  const out = { ...n }
  if (out.carbs != null) {
    out.netCarbs = netCarbs({
      carbsTotalG: out.carbs,
      fiberG: out.fiber,
      sugarAlcohols: out.sugarAlcohols ? [{ type: sugarAlcoholType ?? 'other', g: out.sugarAlcohols }] : [],
      carbsExcludeFiber,
    })
  }
  if (out.kcal == null && (out.protein != null || out.fat != null || out.carbs != null)) out.kcal = kcalFromMacros(out)
  return out
}

/** Nutrients for a portion, including the watch-list amounts that depend on the food type. */
export function portionNutrients(food: Food, grams: number): Nutrients {
  const n = scaleNutrients(food.per_100g, grams)
  const m = food.meta
  if (m.fishSpecies) n.mercuryUg = grams * MERCURY_PPM[m.fishSpecies].ppm
  if (m.processedMeat) n.processedMeatG = grams
  if (m.sweeteners?.length) n.sweetenerServings = 1
  if (m.novaGroup === 4) n.ultraProcessedServings = 1
  if (m.heavyMetalRisk) n.heavyMetalServings = 1
  return n
}

export function buildLogEntry(
  food: Food,
  amount: number,
  unit: string,
  meal: Meal,
  eatenAt: Date,
): Omit<LogEntry, 'id' | 'updated_at' | 'deleted_at'> {
  const { grams, approximate } = toGrams({ unitConversions: food.unit_conversions }, amount, unit)
  return {
    eaten_at: eatenAt.toISOString(),
    meal,
    food_id: food.id,
    food_name: food.brand ? `${food.name} (${food.brand})` : food.name,
    amount,
    unit,
    grams,
    nutrients: portionNutrients(food, grams),
    meta: { approximate, estimated: food.fields_estimated.length > 0 || food.source === 'ai_estimate' },
  }
}

/** Meal slot that fits the time of day. */
export function mealForTime(d: Date): Meal {
  const h = d.getHours()
  if (h < 11) return 'breakfast'
  if (h < 16) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

/** My Foods order: favorites first, then by how often and how recently each was used. */
export function rankFoods(foods: Food[], now = Date.now()): Food[] {
  const score = (f: Food) => {
    const daysAgo = f.last_used_at ? (now - Date.parse(f.last_used_at)) / 86_400_000 : 365
    return (f.favorite ? 1000 : 0) + f.use_count * 2 - Math.min(daysAgo, 60)
  }
  return [...foods].sort((a, b) => score(b) - score(a))
}
