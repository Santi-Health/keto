import { buildLogEntry, type Food, type LogEntry, type Meal, type NewFood } from './foods'
import { addNutrients, type Nutrients } from './nutrients'

/**
 * A saved meal is a named group of foods with portions ("Usual breakfast"). Logging it adds each
 * food as its own log entry, so the watch list, amino acids and food history stay per food.
 */
export interface SavedMealItem {
  foodId: string | null
  /** Copy of the food, used if it was deleted from My Foods. */
  food: NewFood
  amount: number
  unit: string
}

export interface SavedMeal {
  id: string
  name: string
  use_count: number
  items: SavedMealItem[]
  meta: { meal?: Meal }
  updated_at: string
  deleted_at: string | null
}

/** A food without its saved-row fields. */
export function snapshotFood(f: Food | NewFood): NewFood {
  if (!('id' in f)) return f
  const { id: _id, favorite: _fav, use_count: _uc, last_used_at: _lu, updated_at: _ua, deleted_at: _da, ...rest } = f
  void [_id, _fav, _uc, _lu, _ua, _da]
  return rest
}

/** Builds a saved meal from logged entries (e.g. today's breakfast). */
export function mealFromEntries(name: string, entries: LogEntry[], foodById: Record<string, Food>, meal?: Meal): Omit<SavedMeal, 'id' | 'updated_at' | 'deleted_at'> {
  const items: SavedMealItem[] = entries.flatMap((e) => {
    const food = e.food_id ? foodById[e.food_id] : undefined
    if (!food) return []
    return [{ foodId: food.id, food: snapshotFood(food), amount: e.amount, unit: e.unit }]
  })
  return { name: name.trim(), use_count: 0, items, meta: { meal } }
}

/** The food to log for an item: the current version from My Foods, or the saved copy. */
export const itemFood = (item: SavedMealItem, foodById: Record<string, Food>): Food | NewFood =>
  (item.foodId && foodById[item.foodId] && !foodById[item.foodId].deleted_at ? foodById[item.foodId] : null) ?? item.food

/** Nutrients for one item's portion. */
export function itemNutrients(item: SavedMealItem, foodById: Record<string, Food>): Nutrients {
  const f = itemFood(item, foodById)
  const asFood: Food = 'id' in f ? f : { ...f, id: '', favorite: false, use_count: 0, last_used_at: null, updated_at: '', deleted_at: null }
  return buildLogEntry(asFood, item.amount, item.unit, 'snack', new Date()).nutrients
}

export const mealTotals = (items: SavedMealItem[], foodById: Record<string, Food>) => addNutrients(items.map((i) => itemNutrients(i, foodById)))

/** Default name like "Usual breakfast", numbered if taken. */
export function defaultMealName(meal: Meal, taken: string[]): string {
  const base = `Usual ${meal === 'snack' ? 'snack' : meal}`
  if (!taken.includes(base)) return base
  for (let i = 2; ; i++) if (!taken.includes(`${base} ${i}`)) return `${base} ${i}`
}
