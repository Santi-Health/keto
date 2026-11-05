import { netCarbs, type SugarAlcoholType } from './nutrition'
import { deviceTz } from './time'
import { estimateAminos } from './aminoAcids'
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
  /** Meals this food is usually eaten at, as told by the user. */
  meals?: Meal[]
  /** Meals the user said this food is NOT usual for; overrides what history suggests. */
  notMeals?: Meal[]
  /** Vitamins were looked up for this food (so it isn't looked up again), and where they came from. */
  vitaminsChecked?: boolean
  vitaminsFrom?: string
  /** Name on its Add-screen button, when the user renamed it. */
  buttonName?: string
  /** Earlier single-section choice; `sections` replaces it. */
  group?: 'fruits_nuts' | 'condiments' | 'other'
  /** Bottom sections on the Add screen the user put it in ([] = none, back with the meals only). */
  sections?: ('fruits_nuts' | 'picada' | 'condiments')[]
  /** The portion the Add buttons log by default ("6 oz"), when the label serving isn't what the user eats. Amount 0: use the label serving. */
  portion?: { amount: number; unit: string }
  /** Foods logged along with this one from its button (oil, salt, pepper with egg whites), when the user chose them. */
  pairs?: string[]
  /** `pairs` was chosen after eggs got their full set of pairings. */
  pairsChosen?: boolean
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
  /** tz: the time zone it was logged in (the day it counts on, wherever it's viewed later). */
  meta: { approximate?: boolean; estimated?: boolean; tz?: string }
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
  const n = estimateAminos(scaleNutrients(food.per_100g, grams))
  const m = food.meta
  if (m.fishSpecies) n.mercuryUg = grams * MERCURY_PPM[m.fishSpecies].ppm
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
    meta: { approximate, estimated: food.fields_estimated.length > 0 || food.source === 'ai_estimate', tz: deviceTz() },
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

/**
 * Foods to suggest for a meal: ones tagged for it, then ones most often logged at it,
 * favoring recent use. Foods with no link to the meal are left out.
 */
export function suggestForMeal(foods: Food[], logs: Pick<LogEntry, 'food_id' | 'meal' | 'eaten_at'>[], meal: Meal, limit = 8, now = Date.now()): Food[] {
  const counts = new Map<string, number>()
  const lastAt = new Map<string, number>()
  for (const l of logs) {
    if (!l.food_id || l.meal !== meal) continue
    counts.set(l.food_id, (counts.get(l.food_id) ?? 0) + 1)
    lastAt.set(l.food_id, Math.max(lastAt.get(l.food_id) ?? 0, Date.parse(l.eaten_at)))
  }
  const scored = foods
    .filter((f) => !f.meta.notMeals?.includes(meal))
    .map((f) => {
      const tagged = f.meta.meals?.includes(meal) ? 10 : 0
      const n = counts.get(f.id) ?? 0
      const days = lastAt.has(f.id) ? (now - lastAt.get(f.id)!) / 86_400_000 : null
      const recency = days == null ? 0 : Math.max(0, 3 - days / 10)
      return { f, score: tagged + n * 3 + recency + (f.favorite && (tagged || n) ? 1 : 0) }
    })
    .filter((x) => x.score > 0)
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.f)
}

/** Meals a food currently counts as usual for: tagged, or logged there before, minus ones ruled out. */
export function usualMealsFor(food: Pick<Food, 'id' | 'meta'>, logs: Pick<LogEntry, 'food_id' | 'meal'>[]): Meal[] {
  const fromHistory = new Set(logs.filter((l) => l.food_id === food.id).map((l) => l.meal))
  return MEALS.map((m) => m.value).filter(
    (m) => !food.meta.notMeals?.includes(m) && (food.meta.meals?.includes(m) || fromHistory.has(m)),
  )
}

/** Meta after the user says a food is (or isn't) usual for a meal. */
export function setUsual(meta: FoodMeta, meal: Meal, usual: boolean): FoodMeta {
  const meals = new Set(meta.meals ?? [])
  const notMeals = new Set(meta.notMeals ?? [])
  if (usual) {
    meals.add(meal)
    notMeals.delete(meal)
  } else {
    meals.delete(meal)
    notMeals.add(meal)
  }
  return { ...meta, meals: [...meals], notMeals: [...notMeals] }
}
