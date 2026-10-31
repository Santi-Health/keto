import type { NewFood } from './foods'
import type { Nutrients } from './nutrients'

/**
 * One-tap drinks. Water and sparkling water count toward the water goal (logged as water readings);
 * sodas, espresso and teas are logged as foods so caffeine, sodium and sweeteners reach the watch list.
 * Teas with milk log the milk as its own entry, the same as espresso with milk.
 * Values are per serving from US labels (12 oz can) and USDA (espresso, brewed tea).
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
  | 'mate_cocido'
  | 'te_con_leche'
  | 'rooibos'
  | 'kazar'

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
  /** Logged by the fluid ounce (teas) instead of by the can or shot. */
  flOz?: number
  /** Milk that always goes in, logged as its own entry in the same tap. */
  milk?: { key: MilkKey; oz: number }
}

const CAN_G = 355
const SHOT_G = 30
/** Brewed tea weighs about the same as water. */
const FL_OZ_G = 29.6
/** A Nespresso OriginalLine pod brewed as an espresso (40 ml). */
const POD_G = 40

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

// Brewed teas, per 10 fl oz (296 g). Black and rooibos from USDA brewed tea; mate cocido from published
// brewed yerba mate values (no USDA entry), so its caffeine and minerals are estimates.
const tea = (n: Partial<Nutrients>): Nutrients => ({ kcal: 0, protein: 0, fat: 0, carbs: 0, netCarbs: 0, sugars: 0, ...n })

const ALL: Drink[] = [
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
  {
    key: 'mate_cocido',
    label: 'Mate cocido',
    serving: '10 oz + 2 oz Fairlife',
    oz: 12,
    hydration: false,
    color: '#7a8b3a',
    perServing: tea({ kcal: 2, carbs: 0.4, netCarbs: 0.4, potassiumMg: 60, magnesiumMg: 6, sodiumMg: 3, caffeineMg: 55 }),
    estimated: ['caffeineMg', 'potassiumMg', 'magnesiumMg'],
    flOz: 10,
    milk: { key: 'fairlife_fat_free', oz: 2 },
  },
  {
    key: 'te_con_leche',
    label: 'Té con leche',
    serving: '10 oz + 2 oz Fairlife',
    oz: 12,
    hydration: false,
    color: '#8b4a2b',
    perServing: tea({ kcal: 3, carbs: 0.9, netCarbs: 0.9, potassiumMg: 110, magnesiumMg: 9, sodiumMg: 9, caffeineMg: 59 }),
    flOz: 10,
    milk: { key: 'fairlife_fat_free', oz: 2 },
  },
  {
    key: 'rooibos',
    label: 'Rooibos',
    serving: '10 oz, no caffeine',
    oz: 10,
    hydration: false,
    color: '#b5452b',
    perServing: tea({ kcal: 3, carbs: 0.6, netCarbs: 0.6, potassiumMg: 27, magnesiumMg: 3, sodiumMg: 3, caffeineMg: 0 }),
    estimated: ['potassiumMg', 'magnesiumMg'],
    flOz: 10,
  },
  {
    key: 'kazar',
    label: 'Kazaar',
    serving: 'Nespresso pod',
    oz: 1.4,
    hydration: false,
    color: '#3b2a4a',
    // Nespresso doesn't publish per-pod caffeine; Kazaar is a robusta-heavy intensity-12 blend. Set at the high
    // end of the 80–120 mg range on purpose (the user's choice), and treated as a fixed value.
    perServing: { kcal: 2, protein: 0.1, fat: 0, carbs: 0.3, netCarbs: 0.3, sodiumMg: 3, potassiumMg: 45, magnesiumMg: 30, caffeineMg: 120 },
  },
]

/** Button order: the everyday drinks first. */
const ORDER: DrinkKey[] = [
  'water',
  'coke_zero',
  'espresso_double',
  'mate_cocido',
  'kazar',
  'sparkling_water',
  'diet_coke',
  'diet_pepsi',
  'squirt_zero',
  'fanta_zero',
  'sprite_zero',
  'te_con_leche',
  'rooibos',
]

/** The buttons, in order. Single espresso isn't a button; it's the Single/Double switch in the espresso sheet. */
export const DRINKS: Drink[] = ORDER.map((k) => ALL.find((d) => d.key === k)!)

/** Every drink the app knows, including ones without a button (single espresso). */
export const ALL_DRINKS = ALL

/** Drinks that ask which milk went in before logging. */
export const asksForMilk = (d: Drink) => d.key.startsWith('espresso') || d.key === 'kazar'

export const drinkByKey = (key: string) => ALL.find((d) => d.key === key)

/** Food row for a soda or espresso (single and double share one food): nutrients per 100 g plus a serving unit. */
export function drinkFood(d: Drink): NewFood {
  const isEspresso = d.key.startsWith('espresso')
  const grams = d.flOz ? d.flOz * FL_OZ_G : d.key === 'kazar' ? POD_G : isEspresso ? SHOT_G * (d.key === 'espresso_double' ? 2 : 1) : CAN_G
  const per100: Nutrients = {}
  for (const [k, v] of Object.entries(d.perServing ?? {})) per100[k as keyof Nutrients] = Math.round((v * 100 * 1000) / grams) / 1000
  return {
    name: d.label,
    brand: null,
    barcode: null,
    per_100g: per100,
    unit_conversions: [
      d.flOz ? { unit: 'fl oz', grams: FL_OZ_G } : d.key === 'kazar' ? { unit: 'pod', grams: POD_G } : { unit: isEspresso ? 'shot' : 'can', grams: isEspresso ? SHOT_G : CAN_G },
    ],
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
  d.flOz
    ? { amount: d.flOz, unit: 'fl oz' }
    : d.key === 'kazar'
      ? { amount: 1, unit: 'pod' }
      : d.key === 'espresso_double'
      ? { amount: 2, unit: 'shot' }
      : d.key === 'espresso_single'
        ? { amount: 1, unit: 'shot' }
        : { amount: 1, unit: 'can' }

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
