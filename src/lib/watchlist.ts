import { addNutrients, type Nutrients } from './nutrients'

/** FDA average mercury in fish and shellfish (ppm = µg per g), 1990–2012 monitoring. */
export const MERCURY_PPM = {
  scallop: { label: 'Scallops', ppm: 0.003 },
  salmon_canned: { label: 'Salmon (canned)', ppm: 0.008 },
  clam: { label: 'Clams', ppm: 0.009 },
  shrimp: { label: 'Shrimp', ppm: 0.009 },
  oyster: { label: 'Oysters', ppm: 0.012 },
  sardine: { label: 'Sardines', ppm: 0.013 },
  tilapia: { label: 'Tilapia', ppm: 0.013 },
  anchovy: { label: 'Anchovies', ppm: 0.017 },
  salmon: { label: 'Salmon (fresh/frozen)', ppm: 0.022 },
  catfish: { label: 'Catfish', ppm: 0.024 },
  pollock: { label: 'Pollock', ppm: 0.031 },
  mackerel_atlantic: { label: 'Mackerel (Atlantic)', ppm: 0.05 },
  crab: { label: 'Crab', ppm: 0.065 },
  trout: { label: 'Trout', ppm: 0.071 },
  herring: { label: 'Herring', ppm: 0.078 },
  lobster: { label: 'Lobster', ppm: 0.107 },
  cod: { label: 'Cod', ppm: 0.111 },
  tuna_light: { label: 'Tuna, canned light / skipjack', ppm: 0.126 },
  snapper: { label: 'Snapper', ppm: 0.166 },
  mahi: { label: 'Mahi mahi', ppm: 0.178 },
  halibut: { label: 'Halibut', ppm: 0.241 },
  tuna_albacore: { label: 'Tuna, albacore (white)', ppm: 0.35 },
  tuna_yellowfin: { label: 'Tuna, yellowfin / ahi', ppm: 0.354 },
  sea_bass_chilean: { label: 'Chilean sea bass', ppm: 0.354 },
  grouper: { label: 'Grouper', ppm: 0.448 },
  mackerel_spanish: { label: 'Mackerel (Spanish)', ppm: 0.454 },
  marlin: { label: 'Marlin', ppm: 0.485 },
  orange_roughy: { label: 'Orange roughy', ppm: 0.571 },
  tuna_bigeye: { label: 'Tuna, bigeye', ppm: 0.689 },
  mackerel_king: { label: 'King mackerel', ppm: 0.73 },
  shark: { label: 'Shark', ppm: 0.979 },
  swordfish: { label: 'Swordfish', ppm: 0.995 },
  tilefish: { label: 'Tilefish (Gulf of Mexico)', ppm: 1.123 },
} as const

export type FishSpecies = keyof typeof MERCURY_PPM

// Checked in order, so specific names win over generic ones ("albacore" before "tuna").
const FISH_PATTERNS: [RegExp, FishSpecies][] = [
  [/albacore|white tuna|solid white/i, 'tuna_albacore'],
  [/bigeye/i, 'tuna_bigeye'],
  [/yellowfin|\bahi\b/i, 'tuna_yellowfin'],
  [/skipjack|light tuna|chunk light|tuna/i, 'tuna_light'],
  [/swordfish/i, 'swordfish'],
  [/shark/i, 'shark'],
  [/tilefish/i, 'tilefish'],
  [/king mackerel/i, 'mackerel_king'],
  [/spanish mackerel/i, 'mackerel_spanish'],
  [/mackerel/i, 'mackerel_atlantic'],
  [/marlin/i, 'marlin'],
  [/orange roughy/i, 'orange_roughy'],
  [/grouper/i, 'grouper'],
  [/chilean sea bass|patagonian toothfish/i, 'sea_bass_chilean'],
  [/halibut/i, 'halibut'],
  [/mahi/i, 'mahi'],
  [/snapper/i, 'snapper'],
  [/\bcod\b/i, 'cod'],
  [/lobster/i, 'lobster'],
  [/herring/i, 'herring'],
  [/trout/i, 'trout'],
  [/crab/i, 'crab'],
  [/pollock/i, 'pollock'],
  [/catfish/i, 'catfish'],
  [/salmon.*(canned|can\b)|(canned|can\b).*salmon/i, 'salmon_canned'],
  [/salmon|lox/i, 'salmon'],
  [/anchov/i, 'anchovy'],
  [/tilapia/i, 'tilapia'],
  [/sardine/i, 'sardine'],
  [/oyster/i, 'oyster'],
  [/shrimp|prawn/i, 'shrimp'],
  [/clam/i, 'clam'],
  [/scallop/i, 'scallop'],
]

export function detectFishSpecies(text: string): FishSpecies | null {
  // "Tuna salad" etc. still count; "tuna-flavored" cat food is not a concern here.
  return FISH_PATTERNS.find(([re]) => re.test(text))?.[1] ?? null
}

/** Artificial sweeteners by E-number and by name. Stevia and monk fruit aren't counted. */
const SWEETENER_ADDITIVES: Record<string, string> = {
  'en:e950': 'acesulfame K',
  'en:e951': 'aspartame',
  'en:e952': 'cyclamate',
  'en:e954': 'saccharin',
  'en:e955': 'sucralose',
  'en:e961': 'neotame',
  'en:e962': 'aspartame-acesulfame salt',
  'en:e969': 'advantame',
}
const SWEETENER_NAMES: [RegExp, string][] = [
  [/sucralose|splenda/i, 'sucralose'],
  [/aspartame/i, 'aspartame'],
  [/acesulfame/i, 'acesulfame K'],
  [/saccharin/i, 'saccharin'],
  [/cyclamate/i, 'cyclamate'],
  [/neotame/i, 'neotame'],
]

export function detectSweeteners(ingredients: string | null, additives: string[] = []): string[] {
  const found = new Set<string>()
  for (const a of additives) if (SWEETENER_ADDITIVES[a]) found.add(SWEETENER_ADDITIVES[a])
  if (ingredients) for (const [re, name] of SWEETENER_NAMES) if (re.test(ingredients)) found.add(name)
  return [...found]
}

const HEAVY_METAL_RISK = /dark chocolate|cacao|cocoa|protein powder|whey protein|plant protein|pea protein|protein shake/i

export function detectHeavyMetalRisk(text: string): boolean {
  return HEAVY_METAL_RISK.test(text)
}

export function detectPartiallyHydrogenated(ingredients: string | null): boolean {
  return !!ingredients && /partially hydrogenated/i.test(ingredients)
}

// ---------------------------------------------------------------------------

export type WatchKey =
  | 'satFat'
  | 'transFat'
  | 'addedSugars'
  | 'cholesterol'
  | 'omegaRatio'
  | 'mercury'
  | 'retinol'
  | 'heavyMetal'
  | 'alcohol'
  | 'caffeine'
  | 'sweeteners'
  | 'ultraProcessed'
  | 'sodiumHigh'

export interface WatchContext {
  calorieTarget: number | null
  weightKg: number
}

interface WatchDef {
  label: string
  unit: string
  period: 'day' | 'week'
  /** Default limit, or null when it's only tracked. */
  limit: (ctx: WatchContext) => number | null
  value: (total: Required<Nutrients>) => number | null
  guidance: string
}

const pctOfCalories = (pct: number) => (ctx: WatchContext) =>
  ctx.calorieTarget != null ? Math.round((ctx.calorieTarget * pct) / 9) : null

export const WATCH_LIST: Record<WatchKey, WatchDef> = {
  satFat: {
    label: 'Saturated fat',
    unit: 'g',
    period: 'day',
    limit: pctOfCalories(0.1),
    value: (t) => t.satFat,
    guidance: 'Under 10% of calories (AHA suggests ~6%). On keto you will often be over: favor olive oil, avocado and nuts, and compare with your lipid labs.',
  },
  transFat: {
    label: 'Trans fat',
    unit: 'g',
    period: 'day',
    limit: pctOfCalories(0.01),
    value: (t) => t.transFat,
    guidance: 'As close to 0 as possible (WHO: under 1% of calories). Avoid "partially hydrogenated" oils.',
  },
  addedSugars: {
    label: 'Added sugar',
    unit: 'g',
    period: 'day',
    limit: () => 36,
    value: (t) => t.addedSugars,
    guidance: 'AHA: 36 g/day or less for men. Should be near zero on keto.',
  },
  cholesterol: {
    label: 'Cholesterol',
    unit: 'mg',
    period: 'day',
    limit: () => null,
    value: (t) => t.cholesterolMg,
    guidance: 'No hard limit. Tracked to compare with your lipid labs.',
  },
  omegaRatio: {
    label: 'Omega-6 : omega-3',
    unit: ': 1',
    period: 'day',
    limit: () => 4,
    value: (t) => (t.omega3 > 0 ? t.omega6 / t.omega3 : null),
    guidance: 'Lower is better (about 4:1 or less). Seed oils raise it; fatty fish lowers it.',
  },
  mercury: {
    label: 'Mercury',
    unit: 'µg',
    period: 'week',
    limit: (ctx) => Math.round(0.1 * ctx.weightKg * 7),
    value: (t) => t.mercuryUg,
    guidance: 'EPA reference dose: 0.1 µg per kg body weight per day. Estimated from FDA average levels per fish.',
  },
  retinol: {
    label: 'Vitamin A (retinol)',
    unit: 'µg',
    period: 'day',
    limit: () => 3000,
    value: (t) => t.retinolUg,
    guidance: 'Upper limit 3,000 µg/day of preformed vitamin A. Mainly matters with liver and organ meats.',
  },
  heavyMetal: {
    label: 'Lead/cadmium risk foods',
    unit: 'servings',
    period: 'day',
    limit: () => null,
    value: (t) => t.heavyMetalServings,
    guidance: 'Some dark chocolate, cacao and protein powders test high for lead or cadmium. Flag only; labels do not list amounts.',
  },
  alcohol: {
    label: 'Alcohol',
    unit: 'g',
    period: 'day',
    limit: () => 28,
    value: (t) => t.alcohol,
    guidance: 'Up to 2 drinks/day (14 g each). Alcohol also lowers ketones and affects glucose.',
  },
  caffeine: {
    label: 'Caffeine',
    unit: 'mg',
    period: 'day',
    limit: () => 400,
    value: (t) => t.caffeineMg,
    guidance: '400 mg/day or less. Caffeine can raise glucose readings for some people.',
  },
  sweeteners: {
    label: 'Artificial sweeteners',
    unit: 'servings',
    period: 'day',
    limit: () => null,
    value: (t) => t.sweetenerServings,
    guidance: 'Sucralose, aspartame, acesulfame K and others. Tracked to check against your glucose readings.',
  },
  ultraProcessed: {
    label: 'Ultra-processed foods',
    unit: 'servings',
    period: 'day',
    limit: () => null,
    value: (t) => t.ultraProcessedServings,
    guidance: 'Products Open Food Facts rates NOVA 4. Fewer is better.',
  },
  sodiumHigh: {
    label: 'Sodium (upper end)',
    unit: 'mg',
    period: 'day',
    limit: () => 6000,
    value: (t) => t.sodiumMg,
    guidance: 'On keto sodium is a target (3–5 g); this only flags too much.',
  },
}

export type WatchSettings = Partial<Record<WatchKey, { enabled?: boolean; limit?: number | null }>>

/** caution: no limit, but worth a yellow flag when present (sweeteners, ultra-processed). */
export type WatchStatus = 'ok' | 'near' | 'over' | 'info' | 'caution'

export interface WatchItem {
  key: WatchKey
  label: string
  unit: string
  period: 'day' | 'week'
  value: number | null
  limit: number | null
  status: WatchStatus
  guidance: string
}

/**
 * Watch list for a day. `dayItems` are that day's log nutrients; `weekItems` the last 7 days including it.
 */
export function computeWatchList(
  dayItems: Nutrients[],
  weekItems: Nutrients[],
  ctx: WatchContext,
  settings: WatchSettings = {},
): WatchItem[] {
  const day = addNutrients(dayItems)
  const week = addNutrients(weekItems)
  return (Object.keys(WATCH_LIST) as WatchKey[])
    .filter((key) => settings[key]?.enabled !== false)
    .map((key) => {
      const def = WATCH_LIST[key]
      const value = def.value(def.period === 'week' ? week : day)
      const override = settings[key]?.limit
      const limit = override !== undefined ? override : def.limit(ctx)
      let status: WatchStatus = 'info'
      if (limit != null && value != null) status = value > limit ? 'over' : value >= limit * 0.8 ? 'near' : 'ok'
      else if (limit == null && value) status = key === 'heavyMetal' ? 'near' : key === 'sweeteners' || key === 'ultraProcessed' ? 'caution' : 'info'
      return { key, label: def.label, unit: def.unit, period: def.period, value, limit, status, guidance: def.guidance }
    })
}
