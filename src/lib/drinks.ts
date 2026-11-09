import type { Food, NewFood } from './foods'
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
  | 'sparkling_rain'
  | 'spindrift'
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
  | 'volluto_decaf'
  | 'ba_lungo'
  | 'americano'
  | 'americano_decaf'
  | 'fairlife_choc_bottle'
  | 'ultra_zero'
  | 'bacardi'
  | 'whisky'
  | 'red_wine'
  | 'white_wine'
  | 'budweiser'

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
  /** The milks this drink is offered with and how much of each, in place of the full list. */
  milkChoices?: { key: MilkKey; oz: number }[]
  /** Logged as one of these (a bottle) instead of a can. */
  container?: { unit: string; grams: number }
  /** A spirit: asks how many ounces and what it was mixed with. Grams per fluid ounce, lighter than water. */
  spirit?: { mixers: MixerKey[]; gPerFlOz: number }
  /** Beer and wine: not counted as fluid, the same as spirits. */
  alcohol?: boolean
}

/** What a spirit is mixed with: Coke Zero logs as Coke Zero by the ounce, sparkling water as water. */
export type MixerKey = 'coke_zero' | 'sparkling_water'
/** Ounces a spirit starts at. */
export const SPIRIT_OZ = 2

const CAN_G = 355
const SHOT_G = 30
/** Brewed tea weighs about the same as water. */
const FL_OZ_G = 29.6
/** A Nespresso OriginalLine pod brewed as an espresso (40 ml). */
const POD_G = 40
/** A Nespresso ristretto pod brewed short (25 ml). */
const RISTRETTO_POD_G = 25
/** A Nespresso lungo pod brewed long (110 ml). */
const LUNGO_POD_G = 110

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

export const ML_PER_OZ = 29.5735
/** One glass on the drinks tracker; water and sparkling water log a glass per tap. */
export const GLASS_ML = 250

/** Fluid ounces as liters for display: "1.4 L", or "350 ml" under half a liter. */
export const liters = (oz: number) => {
  const ml = oz * ML_PER_OZ
  return ml < 500 ? `${Math.round(ml / 10) * 10} ml` : `${(Math.round(ml / 100) / 10).toLocaleString()} L`
}

/** Glasses to draw for a day's fluids: enough for the goal (more when over it), each empty, half or full. */
export function glasses(totalOz: number, targetOz: number): (0 | 0.5 | 1)[] {
  const halves = Math.round((totalOz * ML_PER_OZ) / (GLASS_ML / 2))
  const n = Math.max(Math.ceil((targetOz * ML_PER_OZ) / GLASS_ML), Math.ceil(halves / 2))
  return Array.from({ length: n }, (_, i) => (halves >= 2 * (i + 1) ? 1 : halves === 2 * i + 1 ? 0.5 : 0))
}

/** Milk weighs about 3% more than water: grams per fluid ounce. */
const G_PER_FL_OZ = 30.5
/** A 340 ml bottle of milk drink, in grams. */
const BOTTLE_340_G = (340 / ML_PER_OZ) * G_PER_FL_OZ

/**
 * fairlife Nutrition Plan chocolate, from the bottle's label: 1 bottle (340 ml) is 150 kcal, 30 g protein,
 * 4 g carbs (1 g fiber, 2 g sugar, none added). Phosphorus 510 mg, iodine 100 mcg and chloride 480 mg aren't tracked.
 */
const FAIRLIFE_CHOC_BOTTLE: Nutrients = {
  kcal: 150,
  protein: 30,
  fat: 2.5,
  satFat: 1.5,
  transFat: 0,
  cholesterolMg: 25,
  sodiumMg: 230,
  carbs: 4,
  fiber: 1,
  netCarbs: 3,
  sugars: 2,
  addedSugars: 0,
  vitDUg: 5,
  calciumMg: 730,
  ironMg: 1.9,
  potassiumMg: 460,
  vitAUg: 200,
  b12Ug: 1.4,
  magnesiumMg: 50,
  zincMg: 6,
  seleniumUg: 20,
}
const FAIRLIFE_SWEETENERS = ['monk fruit', 'acesulfame K', 'sucralose', 'stevia']

/** What goes in an americano. */
const AMERICANO_MILKS: Drink['milkChoices'] = [
  { key: 'whole', oz: 2 },
  { key: 'nonfat', oz: 2 },
  { key: 'half_and_half', oz: 1 },
]

/**
 * 80-proof spirits, USDA FoodData Central "alcoholic beverage, distilled, 80 proof": 231 kcal per 100 g, no carbs.
 * A fluid ounce weighs 27.8 g, so 64 kcal. Alcohol itself isn't tracked; its calories are.
 */
const SPIRIT_G_PER_FL_OZ = 27.8
const spirit80 = (): Nutrients => tea({ kcal: 64, sodiumMg: 0, potassiumMg: 0.3 })

/** A 5 fl oz glass of wine. */
const WINE_GLASS_G = 147

const ALL: Drink[] = [
  { key: 'water', label: 'Water', serving: '1 glass (250 ml)', oz: GLASS_ML / ML_PER_OZ, hydration: true, color: 'var(--water)', perServing: null },
  { key: 'sparkling_water', label: 'Sparkling water', serving: '1 glass (250 ml)', oz: GLASS_ML / ML_PER_OZ, hydration: true, color: 'var(--water)', perServing: null },
  { key: 'sparkling_rain', label: 'Sparkling Rain', serving: '355 ml can', oz: 12, hydration: true, color: 'var(--water)', perServing: null },
  // Lemon, from Spindrift's label: real juice, so it has a few calories and is logged as a food, not as water.
  { key: 'spindrift', label: 'Spindrift', serving: '355 ml can', oz: 12, hydration: false, color: '#f2d64b', perServing: tea({ kcal: 3, carbs: 1, netCarbs: 1, sodiumMg: 0, caffeineMg: 0 }) },
  { key: 'diet_coke', label: 'Diet Coke', serving: '355 ml can', oz: 12, hydration: false, color: '#b8b8b8', perServing: soda(46, 40), sweeteners: ['aspartame'] },
  { key: 'coke_zero', label: 'Coke Zero', serving: '355 ml can', oz: 12, hydration: false, color: '#e4002b', perServing: soda(34, 40, 60), sweeteners: ['aspartame', 'acesulfame K'] },
  { key: 'diet_pepsi', label: 'Diet Pepsi', serving: '355 ml can', oz: 12, hydration: false, color: '#1f4fa0', perServing: soda(35, 35), sweeteners: ['aspartame', 'acesulfame K'] },
  { key: 'squirt_zero', label: 'Squirt Zero', serving: '355 ml can', oz: 12, hydration: false, color: '#f2c200', perServing: soda(0, 40), sweeteners: ['aspartame', 'acesulfame K'], estimated: ['sodiumMg'] },
  { key: 'fanta_zero', label: 'Fanta Zero', serving: '355 ml can', oz: 12, hydration: false, color: '#ff8200', perServing: soda(0, 40), sweeteners: ['aspartame', 'acesulfame K'], estimated: ['sodiumMg'] },
  { key: 'sprite_zero', label: 'Sprite Zero', serving: '355 ml can', oz: 12, hydration: false, color: '#00a651', perServing: soda(0, 35), sweeteners: ['aspartame', 'acesulfame K'], estimated: ['sodiumMg'] },
  { key: 'espresso_single', label: 'Espresso', serving: 'single shot', oz: 1, hydration: false, color: '#6f4e37', perServing: espresso(1) },
  { key: 'espresso_double', label: 'Espresso', serving: 'double shot', oz: 2, hydration: false, color: '#6f4e37', perServing: espresso(2) },
  {
    key: 'mate_cocido',
    label: 'Mate cocido',
    serving: '300 ml + 60 ml Fairlife',
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
    serving: '300 ml + 60 ml Fairlife',
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
    serving: '300 ml, no caffeine',
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
    container: { unit: 'pod', grams: POD_G },
  },
  {
    // Ispirazione Ristretto Decaffeinato (the key predates the name; kept so earlier logs still match).
    key: 'volluto_decaf',
    label: 'Decaf Ristretto',
    serving: 'Nespresso pod',
    oz: RISTRETTO_POD_G / ML_PER_OZ,
    hydration: false,
    color: '#1c1a1a',
    // Brewed as a 25 ml ristretto. Decaf keeps a few mg of caffeine; Nespresso doesn't publish it, so it's
    // estimated, with the minerals from USDA espresso.
    perServing: { kcal: 1.5, protein: 0.1, fat: 0, carbs: 0.2, netCarbs: 0.2, sodiumMg: 2, potassiumMg: 30, magnesiumMg: 20, caffeineMg: 3 },
    estimated: ['caffeineMg', 'potassiumMg', 'magnesiumMg'],
    container: { unit: 'pod', grams: RISTRETTO_POD_G },
  },
  {
    key: 'ba_lungo',
    label: 'BA Lungo',
    serving: 'Nespresso lungo pod',
    oz: LUNGO_POD_G / ML_PER_OZ,
    hydration: false,
    color: '#46464c',
    // Buenos Aires Lungo, brewed as a 110 ml lungo. Nespresso doesn't publish per-pod caffeine; its lungo pods
    // run about 80–90 mg, so 85 mg. Minerals from USDA brewed coffee for 110 ml.
    perServing: { kcal: 1, protein: 0.1, fat: 0, carbs: 0, netCarbs: 0, sodiumMg: 2, potassiumMg: 54, magnesiumMg: 3, caffeineMg: 85 },
    estimated: ['caffeineMg', 'potassiumMg', 'magnesiumMg'],
    container: { unit: 'pod', grams: LUNGO_POD_G },
  },
  {
    key: 'americano',
    label: 'Americano',
    serving: '10 oz',
    oz: 10,
    hydration: false,
    color: '#4a2f1d',
    // A double espresso topped up with hot water to 10 fl oz.
    perServing: espresso(2),
    flOz: 10,
    milkChoices: AMERICANO_MILKS,
  },
  {
    key: 'americano_decaf',
    label: 'Decaf Americano',
    serving: '10 oz',
    oz: 10,
    hydration: false,
    color: '#4a2f1d',
    // Decaf keeps a few mg of caffeine per shot; the amount varies, so it's an estimate, the same as the decaf pod.
    perServing: { ...espresso(2), caffeineMg: 6 },
    estimated: ['caffeineMg'],
    flOz: 10,
    milkChoices: AMERICANO_MILKS,
  },
  {
    key: 'fairlife_choc_bottle',
    label: 'Fairlife choc',
    serving: '340 ml bottle',
    oz: 340 / ML_PER_OZ,
    hydration: false,
    color: '#5a3825',
    perServing: FAIRLIFE_CHOC_BOTTLE,
    sweeteners: FAIRLIFE_SWEETENERS,
    container: { unit: 'bottle', grams: BOTTLE_340_G },
  },
  // Michelob Ultra Zero, alcohol-free, from its label: 29 kcal, 6.5 g carbs, 0 g fat, under 1 g protein per 12 oz can.
  { key: 'ultra_zero', label: 'Ultra Zero', serving: '355 ml can, 0% alc', oz: 12, hydration: false, color: '#1d3c78', perServing: tea({ kcal: 29, carbs: 6.5, netCarbs: 6.5 }) },
  { key: 'bacardi', label: 'Bacardi rum', serving: `${SPIRIT_OZ} oz`, oz: SPIRIT_OZ, hydration: false, color: '#c9a227', perServing: spirit80(), flOz: 1, spirit: { mixers: ['coke_zero'], gPerFlOz: SPIRIT_G_PER_FL_OZ } },
  {
    key: 'whisky',
    label: 'Whisky',
    serving: `${SPIRIT_OZ} oz`,
    oz: SPIRIT_OZ,
    hydration: false,
    color: '#b5651d',
    perServing: spirit80(),
    flOz: 1,
    spirit: { mixers: ['coke_zero', 'sparkling_water'], gPerFlOz: SPIRIT_G_PER_FL_OZ },
  },
  // USDA FoodData Central, red table wine (no Malbec entry): per 100 g 85 kcal, 2.61 g carbs, 0.62 g sugar.
  {
    key: 'red_wine',
    label: 'Malbec',
    serving: '5 oz glass',
    oz: 5,
    hydration: false,
    color: '#6d1a2a',
    perServing: tea({ kcal: 125, protein: 0.1, carbs: 3.8, netCarbs: 3.8, sugars: 0.9, sodiumMg: 6, potassiumMg: 187, magnesiumMg: 18 }),
    container: { unit: 'glass', grams: WINE_GLASS_G },
    alcohol: true,
  },
  // USDA FoodData Central, Pinot Grigio: per 100 g 83 kcal, 2.06 g carbs.
  {
    key: 'white_wine',
    label: 'Pinot Grigio',
    serving: '5 oz glass',
    oz: 5,
    hydration: false,
    color: '#e8d98a',
    perServing: tea({ kcal: 122, protein: 0.1, carbs: 3, netCarbs: 3, sugars: 1.4, sodiumMg: 7, potassiumMg: 104, magnesiumMg: 15 }),
    container: { unit: 'glass', grams: WINE_GLASS_G },
    alcohol: true,
  },
  // Budweiser's label: 145 kcal, 10.6 g carbs, 1.3 g protein, 0 g fat per 12 oz can, 5% alcohol.
  { key: 'budweiser', label: 'Budweiser', serving: '355 ml can', oz: 12, hydration: false, color: '#c8102e', perServing: tea({ kcal: 145, protein: 1.3, carbs: 10.6, netCarbs: 10.6 }), alcohol: true },
]


/** Button order: the everyday drinks first. */
const ORDER: DrinkKey[] = [
  'mate_cocido',
  'water',
  'coke_zero',
  'espresso_double',
  'kazar',
  'volluto_decaf',
  'ba_lungo',
  'americano',
  'americano_decaf',
  'sparkling_water',
  'sparkling_rain',
  'spindrift',
  'diet_coke',
  'diet_pepsi',
  'squirt_zero',
  'fanta_zero',
  'sprite_zero',
  'te_con_leche',
  'rooibos',
  'fairlife_choc_bottle',
  'ultra_zero',
  'bacardi',
  'whisky',
  'red_wine',
  'white_wine',
  'budweiser',
]

/** The buttons, in order. Single espresso isn't a button; it's the Single/Double switch in the espresso sheet. */
export const DRINKS: Drink[] = ORDER.map((k) => ALL.find((d) => d.key === k)!)

/** Every drink the app knows, including ones without a button (single espresso). */
export const ALL_DRINKS = ALL

/** Drinks that ask which milk went in before logging. */
export const asksForMilk = (d: Drink) => d.key.startsWith('espresso') || d.container?.unit === 'pod' || !!d.milkChoices

export const drinkByKey = (key: string) => ALL.find((d) => d.key === key)

/** A 12 oz can: a tap logs the can, holding the button asks how many ounces. */
export const isCan = (d: Drink) => d.serving.includes('can') && !d.container && !d.flOz && !d.spirit && !d.key.startsWith('espresso')

/** Food row for a soda or espresso (single and double share one food): nutrients per 100 g plus a serving unit. */
export function drinkFood(d: Drink): NewFood {
  const isEspresso = d.key.startsWith('espresso')
  const flOzG = d.spirit?.gPerFlOz ?? FL_OZ_G
  const grams = d.container ? d.container.grams : d.flOz ? d.flOz * flOzG : isEspresso ? SHOT_G * (d.key === 'espresso_double' ? 2 : 1) : CAN_G
  const per100: Nutrients = {}
  for (const [k, v] of Object.entries(d.perServing ?? {})) per100[k as keyof Nutrients] = Math.round((v * 100 * 1000) / grams) / 1000
  return {
    name: d.label,
    brand: null,
    barcode: null,
    per_100g: per100,
    unit_conversions: [
      d.container ? { unit: d.container.unit, grams: d.container.grams } : d.flOz ? { unit: 'fl oz', grams: flOzG } : { unit: isEspresso ? 'shot' : 'can', grams: isEspresso ? SHOT_G : CAN_G },
      // A can is 12 fl oz.
      ...(isCan(d) ? [{ unit: 'fl oz', grams: CAN_G / 12 }] : []),
    ],
    ingredients_text: null,
    keto_notes: d.sweeteners?.length ? `${d.perServing?.sugars ? 'No added sugar' : 'Zero sugar'}; sweetened with ${d.sweeteners.join(' and ')}.` : null,
    carbs_exclude_fiber: false,
    source: 'manual',
    confidence: d.estimated?.length ? 'medium' : 'high',
    fields_estimated: d.estimated ?? [],
    meta: { externalId: `drink:${isEspresso ? 'espresso' : d.key}`, sweeteners: d.sweeteners ?? [], meals: [] },
  }
}

/** Amount and unit to log for one tap. */
export const drinkPortion = (d: Drink) =>
  d.spirit
    ? { amount: SPIRIT_OZ, unit: 'fl oz' }
    : d.container
    ? { amount: 1, unit: d.container.unit }
    : d.flOz
    ? { amount: d.flOz, unit: 'fl oz' }
    : d.key === 'espresso_double'
      ? { amount: 2, unit: 'shot' }
      : d.key === 'espresso_single'
        ? { amount: 1, unit: 'shot' }
        : { amount: 1, unit: 'can' }

/** Milks added to espresso, per 100 g. Fairlife from its US labels (per 1 cup = 240 ml); non-fat from USDA. */
export type MilkKey = 'fairlife_chocolate' | 'fairlife_fat_free' | 'nonfat' | 'whole' | 'half_and_half'

export interface Milk {
  key: MilkKey
  label: string
  per100g: Nutrients
  sweeteners?: string[]
  estimated?: string[]
}

/** A label's numbers for a whole bottle of `ml`, as per 100 g. */
const perBottle = (n: Nutrients, ml: number): Nutrients => {
  const k = 100 / ((ml / ML_PER_OZ) * G_PER_FL_OZ)
  return Object.fromEntries(Object.entries(n).map(([key, v]) => [key, Math.round(v * k * 1000) / 1000])) as Nutrients
}

export const MILKS: Milk[] = [
  {
    key: 'fairlife_chocolate',
    label: 'Fairlife chocolate',
    // The same fairlife Nutrition Plan chocolate as the bottle button, poured into coffee.
    per100g: perBottle(FAIRLIFE_CHOC_BOTTLE, 340),
    sweeteners: FAIRLIFE_SWEETENERS,
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
  {
    key: 'whole',
    label: 'Whole',
    // USDA FoodData Central, milk, whole, 3.25% milkfat.
    per100g: { kcal: 61, protein: 3.15, fat: 3.25, satFat: 1.86, carbs: 4.8, netCarbs: 4.8, sugars: 5.05, cholesterolMg: 10, sodiumMg: 43, potassiumMg: 132, calciumMg: 113, magnesiumMg: 10 },
  },
  {
    key: 'half_and_half',
    label: 'Half and half',
    // USDA FoodData Central, cream, fluid, half and half.
    per100g: { kcal: 131, protein: 3.13, fat: 11.5, satFat: 7.03, carbs: 4.3, netCarbs: 4.3, sugars: 4.13, cholesterolMg: 35, sodiumMg: 61, potassiumMg: 132, calciumMg: 107, magnesiumMg: 10 },
  },
]

const milkName = (m: Milk) => (m.key === 'half_and_half' ? m.label : `${m.label} milk`)

/** Names of the drink-button drinks and milks, so a copy saved by hand counts as a drink too. */
const DRINK_NAMES = new Set([...ALL.map((d) => d.label), ...MILKS.map(milkName)].map((n) => n.toLowerCase()))

/** A saved food that is one of the drink buttons (or a milk), not a food button. */
export const isDrinkFood = (f: Pick<Food, 'name' | 'meta'>) => !!f.meta.externalId?.startsWith('drink:') || DRINK_NAMES.has(f.name.toLowerCase())

export function milkFood(m: Milk): NewFood {
  return {
    name: milkName(m),
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

/**
 * Caffeine's mild diuretic effect only matters at high doses: below ~400 mg a day, coffee, tea and
 * caffeinated sodas hydrate about as well as water (Killer 2014; Maughan 2016 beverage hydration index).
 * Above that, about 0.36 mL extra urine per mg (Zhang 2015 meta-analysis: ~109 mL for 300 mg).
 */
export const CAFFEINE_FREE_MG = 400
const LOSS_ML_PER_MG = 0.36

export interface Hydration {
  /** Plain and sparkling water. */
  waterOz: number
  /** Everything else you drank: sodas, coffee, tea, milk. */
  drinksOz: number
  caffeineMg: number
  /** Fluid taken off for caffeine above 400 mg. */
  caffeineLossOz: number
  totalOz: number
}

/** Fluid for the day: water readings plus logged drinks (by volume), less a small caffeine adjustment over 400 mg. */
export function hydration(waterOz: number, drinks: { grams: number; caffeineMg?: number }[]): Hydration {
  const drinksOz = drinks.reduce((s, d) => s + d.grams, 0) / FL_OZ_G
  const caffeineMg = drinks.reduce((s, d) => s + (d.caffeineMg ?? 0), 0)
  const caffeineLossOz = (Math.max(0, caffeineMg - CAFFEINE_FREE_MG) * LOSS_ML_PER_MG) / FL_OZ_G
  return { waterOz, drinksOz, caffeineMg, caffeineLossOz, totalOz: Math.max(0, waterOz + drinksOz - caffeineLossOz) }
}
