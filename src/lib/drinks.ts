import type { NewFood } from './foods'
import type { Nutrients } from './nutrients'

/**
 * One-tap drinks. Water and sparkling water count toward the water goal (logged as water readings);
 * sodas and espresso are logged as foods so caffeine, sodium and sweeteners reach the watch list.
 * Values are per serving from US labels (12 oz can) and USDA espresso.
 */
export type DrinkKey =
  | 'water'
  | 'sparkling_water'
  | 'diet_coke'
  | 'coke_zero'
  | 'diet_pepsi'
  | 'squirt_zero'
  | 'fanta_zero'
  | 'sprite_zero'
  | 'espresso_single'
  | 'espresso_double'

export interface Drink {
  key: DrinkKey
  label: string
  /** Serving name and size shown on the button. */
  serving: string
  oz: number
  /** Counts toward the daily water goal. */
  hydration: boolean
  color: string
  /** Nutrients for one serving (null for plain water). */
  perServing: Nutrients | null
  sweeteners?: string[]
  /** Nutrients not on the label, filled from similar drinks. */
  estimated?: string[]
}

const CAN_G = 355
const SHOT_G = 30

const soda = (caffeineMg: number, sodiumMg: number, potassiumMg = 0): Nutrients => ({
  kcal: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
  netCarbs: 0,
  sugars: 0,
  sodiumMg,
  potassiumMg,
  caffeineMg,
})

// USDA FoodData Central "espresso, restaurant-prepared" per 100 g, scaled to a 30 g shot.
const espresso = (shots: number): Nutrients => ({
  kcal: 2.7 * shots,
  protein: 0.03 * shots,
  fat: 0.05 * shots,
  carbs: 0.5 * shots,
  netCarbs: 0.5 * shots,
  sodiumMg: 4 * shots,
  potassiumMg: 35 * shots,
  magnesiumMg: 24 * shots,
  caffeineMg: 64 * shots,
})

export const DRINKS: Drink[] = [
  { key: 'water', label: 'Water', serving: '1 cup (8 oz)', oz: 8, hydration: true, color: 'var(--water)', perServing: null },
  { key: 'sparkling_water', label: 'Sparkling water', serving: '1 cup (8 oz)', oz: 8, hydration: true, color: 'var(--water)', perServing: null },
  { key: 'diet_coke', label: 'Diet Coke', serving: '12 oz can', oz: 12, hydration: false, color: '#b8b8b8', perServing: soda(46, 40), sweeteners: ['aspartame'] },
  { key: 'coke_zero', label: 'Coke Zero', serving: '12 oz can', oz: 12, hydration: false, color: '#e4002b', perServing: soda(34, 40, 60), sweeteners: ['aspartame', 'acesulfame K'] },
  { key: 'diet_pepsi', label: 'Diet Pepsi', serving: '12 oz can', oz: 12, hydration: false, color: '#1f4fa0', perServing: soda(35, 35), sweeteners: ['aspartame', 'acesulfame K'] },
  { key: 'squirt_zero', label: 'Squirt Zero', serving: '12 oz can', oz: 12, hydration: false, color: '#f2c200', perServing: soda(0, 40), sweeteners: ['aspartame', 'acesulfame K'], estimated: ['sodiumMg'] },
  { key: 'fanta_zero', label: 'Fanta Zero', serving: '12 oz can', oz: 12, hydration: false, color: '#ff8200', perServing: soda(0, 40), sweeteners: ['aspartame', 'acesulfame K'], estimated: ['sodiumMg'] },
  { key: 'sprite_zero', label: 'Sprite Zero', serving: '12 oz can', oz: 12, hydration: false, color: '#00a651', perServing: soda(0, 35), sweeteners: ['aspartame', 'acesulfame K'], estimated: ['sodiumMg'] },
  { key: 'espresso_single', label: 'Espresso', serving: 'single shot', oz: 1, hydration: false, color: '#6f4e37', perServing: espresso(1) },
  { key: 'espresso_double', label: 'Espresso', serving: 'double shot', oz: 2, hydration: false, color: '#6f4e37', perServing: espresso(2) },
]

export const drinkByKey = (key: string) => DRINKS.find((d) => d.key === key)

/** Food row for a soda or espresso (single and double share one food): nutrients per 100 g plus a serving unit. */
export function drinkFood(d: Drink): NewFood {
  const isEspresso = d.key.startsWith('espresso')
  const grams = isEspresso ? SHOT_G * (d.key === 'espresso_double' ? 2 : 1) : CAN_G
  const per100: Nutrients = {}
  for (const [k, v] of Object.entries(d.perServing ?? {})) per100[k as keyof Nutrients] = Math.round((v * 100 * 1000) / grams) / 1000
  return {
    name: d.label,
    brand: null,
    barcode: null,
    per_100g: per100,
    unit_conversions: [{ unit: isEspresso ? 'shot' : 'can', grams: isEspresso ? SHOT_G : CAN_G }],
    ingredients_text: null,
    keto_notes: d.sweeteners?.length ? `Zero sugar; sweetened with ${d.sweeteners.join(' and ')}.` : null,
    carbs_exclude_fiber: false,
    source: 'manual',
    confidence: d.estimated?.length ? 'medium' : 'high',
    fields_estimated: d.estimated ?? [],
    meta: { externalId: `drink:${isEspresso ? 'espresso' : d.key}`, sweeteners: d.sweeteners ?? [], meals: [] },
  }
}

/** Amount and unit to log for one tap. */
export const drinkPortion = (d: Drink) =>
  d.key === 'espresso_double' ? { amount: 2, unit: 'shot' } : d.key === 'espresso_single' ? { amount: 1, unit: 'shot' } : { amount: 1, unit: 'can' }

/** Milks added to espresso, per 100 g. Fairlife from its US labels (per 1 cup = 240 ml); non-fat from USDA. */
export type MilkKey = 'fairlife_chocolate' | 'fairlife_fat_free' | 'nonfat'

export interface Milk {
  key: MilkKey
  label: string
  per100g: Nutrients
  sweeteners?: string[]
  estimated?: string[]
}

/** Milk is about 3% denser than water. */
const G_PER_FL_OZ = 30.5

export const MILKS: Milk[] = [
  {
    key: 'fairlife_chocolate',
    label: 'Fairlife chocolate',
    // 2% reduced-fat chocolate, per cup: 140 kcal, 4.5 g fat, 13 g carbs, 12 g sugar, 13 g protein.
    per100g: { kcal: 57.4, protein: 5.33, fat: 1.84, satFat: 1.23, carbs: 5.33, netCarbs: 5.33, sugars: 4.92, cholesterolMg: 8.2, sodiumMg: 102, potassiumMg: 164, calciumMg: 156 },
    sweeteners: ['sucralose', 'acesulfame K'],
    estimated: ['sodiumMg', 'potassiumMg'],
  },
  {
    key: 'fairlife_fat_free',
    label: 'Fairlife fat-free',
    // Per cup: 80 kcal, 0 g fat, 6 g carbs, 6 g sugar, 13 g protein, 120 mg sodium.
    per100g: { kcal: 32.8, protein: 5.33, fat: 0, satFat: 0, carbs: 2.46, netCarbs: 2.46, sugars: 2.46, cholesterolMg: 2, sodiumMg: 49, potassiumMg: 164, calciumMg: 156 },
  },
  {
    key: 'nonfat',
    label: 'Regular non-fat',
    // USDA FoodData Central, milk, nonfat (skim).
    per100g: { kcal: 34, protein: 3.37, fat: 0.08, satFat: 0.05, carbs: 4.96, netCarbs: 4.96, sugars: 5.09, cholesterolMg: 2, sodiumMg: 42, potassiumMg: 156, calciumMg: 122, magnesiumMg: 11 },
  },
]

export function milkFood(m: Milk): NewFood {
  return {
    name: `${m.label} milk`,
    brand: m.key.startsWith('fairlife') ? 'fairlife' : null,
    barcode: null,
    per_100g: m.per100g,
    unit_conversions: [{ unit: 'fl oz', grams: G_PER_FL_OZ }],
    ingredients_text: null,
    keto_notes: m.key === 'fairlife_fat_free' ? 'Ultra-filtered: half the sugar and more protein than regular milk.' : null,
    carbs_exclude_fiber: false,
    source: 'manual',
    confidence: m.estimated?.length ? 'medium' : 'high',
    fields_estimated: m.estimated ?? [],
    meta: { externalId: `drink:milk_${m.key}`, sweeteners: m.sweeteners ?? [], meals: [] },
  }
}
