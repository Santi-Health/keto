import { completeNutrients, type NewFood } from './foods'
import type { Nutrients } from './nutrients'
import type { UnitConversion } from './units'
import {
  detectFishSpecies,
  detectHeavyMetalRisk,
  detectPartiallyHydrogenated,
  detectProcessedMeat,
  detectSweeteners,
} from './watchlist'

const USDA_KEY = (import.meta.env.VITE_USDA_API_KEY as string | undefined) || 'DEMO_KEY'

/** Adds the watch-list flags that can be read from a food's name and ingredients. */
function withDetectedMeta(food: NewFood, categories: string[] = []): NewFood {
  const text = [food.name, food.brand].filter(Boolean).join(' ')
  return {
    ...food,
    meta: {
      ...food.meta,
      fishSpecies: food.meta.fishSpecies ?? detectFishSpecies(text),
      processedMeat: food.meta.processedMeat ?? detectProcessedMeat(text, categories),
      sweeteners: detectSweeteners(food.ingredients_text, food.meta.additives),
      heavyMetalRisk: detectHeavyMetalRisk(`${text} ${categories.join(' ')}`),
      partiallyHydrogenated: detectPartiallyHydrogenated(food.ingredients_text),
    },
  }
}

function ketoNotes(food: NewFood): string | null {
  const notes: string[] = []
  if (food.meta.partiallyHydrogenated) notes.push('Contains partially hydrogenated oil (trans fat).')
  if (food.meta.sweeteners?.length) notes.push(`Artificial sweeteners: ${food.meta.sweeteners.join(', ')}.`)
  if (/maltitol/i.test(food.ingredients_text ?? '')) notes.push('Contains maltitol, which can raise blood sugar.')
  if (/dextrose|maltodextrin|corn syrup|cane sugar/i.test(food.ingredients_text ?? ''))
    notes.push('Contains added sugars or starches.')
  if (food.carbs_exclude_fiber) notes.push('Label carbs already exclude fiber (EU/UK style).')
  return notes.length ? notes.join(' ') : null
}

// --- USDA FoodData Central ------------------------------------------------

/** USDA nutrient numbers, amounts per 100 g. */
const USDA_MAP: Partial<Record<string, keyof Nutrients>> = {
  '208': 'kcal',
  '203': 'protein',
  '204': 'fat',
  '606': 'satFat',
  '605': 'transFat',
  '205': 'carbs',
  '291': 'fiber',
  '269': 'sugars',
  '539': 'addedSugars',
  '307': 'sodiumMg',
  '306': 'potassiumMg',
  '304': 'magnesiumMg',
  '301': 'calciumMg',
  '303': 'ironMg',
  '601': 'cholesterolMg',
  '319': 'retinolUg',
  '262': 'caffeineMg',
  '221': 'alcohol',
}
const OMEGA3 = ['851', '629', '621', '631'] // ALA, EPA, DHA, DPA
const OMEGA3_ALA_FALLBACK = '619' // 18:3 total, when n-3 ALA isn't split out
const OMEGA6 = ['618', '620'] // linoleic, arachidonic

interface UsdaFood {
  fdcId: number
  description: string
  dataType: string
  brandOwner?: string
  brandName?: string
  gtinUpc?: string
  ingredients?: string
  servingSize?: number
  servingSizeUnit?: string
  householdServingFullText?: string
  foodNutrients: { nutrientNumber?: string; value?: number }[]
  foodMeasures?: { disseminationText?: string; gramWeight?: number }[]
}

export function mapUsdaFood(f: UsdaFood): NewFood {
  const byNumber = new Map(f.foodNutrients.filter((n) => n.nutrientNumber && n.value != null).map((n) => [n.nutrientNumber!, n.value!]))
  const n: Nutrients = {}
  for (const [num, key] of Object.entries(USDA_MAP)) if (byNumber.has(num)) n[key!] = byNumber.get(num)
  const o3 = OMEGA3.filter((k) => byNumber.has(k))
  if (o3.length) n.omega3 = o3.reduce((s, k) => s + byNumber.get(k)!, 0)
  else if (byNumber.has(OMEGA3_ALA_FALLBACK)) n.omega3 = byNumber.get(OMEGA3_ALA_FALLBACK)
  const o6 = OMEGA6.filter((k) => byNumber.has(k))
  if (o6.length) n.omega6 = o6.reduce((s, k) => s + byNumber.get(k)!, 0)

  const units: UnitConversion[] = []
  for (const m of f.foodMeasures ?? []) {
    if (m.disseminationText && m.gramWeight && !/quantity not specified/i.test(m.disseminationText))
      units.push({ unit: m.disseminationText, grams: m.gramWeight })
  }
  if (f.servingSize && /^g$|^grm$/i.test(f.servingSizeUnit ?? ''))
    units.unshift({ unit: f.householdServingFullText ? `1 serving (${f.householdServingFullText})` : '1 serving', grams: f.servingSize })

  const brand = f.brandName || f.brandOwner || null
  const food: NewFood = {
    name: titleCase(f.description),
    brand: brand ? titleCase(brand) : null,
    barcode: f.gtinUpc ?? null,
    per_100g: completeNutrients(n, false),
    unit_conversions: dedupeUnits(units),
    ingredients_text: f.ingredients ?? null,
    keto_notes: null,
    carbs_exclude_fiber: false,
    source: 'database',
    confidence: f.dataType === 'Branded' ? 'medium' : 'high',
    fields_estimated: [],
    meta: { externalId: `usda:${f.fdcId}` },
  }
  const withMeta = withDetectedMeta(food)
  return { ...withMeta, keto_notes: ketoNotes(withMeta) }
}

export async function searchUsda(query: string, signal?: AbortSignal): Promise<NewFood[]> {
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded'],
      pageSize: 25,
    }),
    signal,
  })
  if (res.status === 429) throw new Error('The USDA database is busy (hourly limit reached). Try again later or add a free USDA key.')
  if (!res.ok) throw new Error(`USDA search failed (${res.status}).`)
  const data = (await res.json()) as { foods: UsdaFood[] }
  return data.foods.map(mapUsdaFood)
}

// --- Open Food Facts ------------------------------------------------------

interface OffProduct {
  code?: string
  product_name?: string
  brands?: string
  ingredients_text?: string
  serving_quantity?: number | string
  serving_size?: string
  countries_tags?: string[]
  categories_tags?: string[]
  additives_tags?: string[]
  nova_group?: number
  image_front_small_url?: string
  nutriments?: Record<string, number | string | undefined>
}

const OFF_FIELDS =
  'code,product_name,brands,ingredients_text,serving_quantity,serving_size,countries_tags,categories_tags,additives_tags,nova_group,image_front_small_url,nutriments'

export function mapOffProduct(p: OffProduct): NewFood {
  const nm = p.nutriments ?? {}
  const num = (k: string) => {
    const v = nm[`${k}_100g`]
    const n = typeof v === 'string' ? Number(v) : v
    return n != null && Number.isFinite(n) ? n : undefined
  }
  const grams = (k: string) => num(k)
  const mg = (k: string) => (num(k) != null ? num(k)! * 1000 : undefined) // OFF stores minerals in g
  const n: Nutrients = {
    kcal: num('energy-kcal'),
    protein: grams('proteins'),
    fat: grams('fat'),
    satFat: grams('saturated-fat'),
    transFat: grams('trans-fat'),
    carbs: grams('carbohydrates'),
    fiber: grams('fiber'),
    sugars: grams('sugars'),
    addedSugars: grams('added-sugars'),
    sugarAlcohols: grams('polyols'),
    sodiumMg: mg('sodium'),
    potassiumMg: mg('potassium'),
    magnesiumMg: mg('magnesium'),
    calciumMg: mg('calcium'),
    ironMg: mg('iron'),
    cholesterolMg: mg('cholesterol'),
    omega3: grams('omega-3-fat'),
    omega6: grams('omega-6-fat'),
    caffeineMg: mg('caffeine'),
    // OFF lists alcohol as % by volume; ~0.789 g per ml.
    alcohol: num('alcohol') != null ? num('alcohol')! * 0.789 : undefined,
  }
  for (const k of Object.keys(n) as (keyof Nutrients)[]) if (n[k] == null) delete n[k]

  // US and Canadian labels count fiber inside carbs; most others list it separately.
  const countries = p.countries_tags ?? []
  const carbsExcludeFiber = !countries.some((c) => c === 'en:united-states' || c === 'en:canada') && countries.length > 0
  const serving = Number(p.serving_quantity)
  const ingredients = p.ingredients_text?.trim() || null
  const sugarAlcoholType = /erythritol/i.test(ingredients ?? '') ? 'erythritol' : /allulose/i.test(ingredients ?? '') ? 'allulose' : undefined

  const food: NewFood = {
    name: p.product_name?.trim() || 'Unnamed product',
    brand: p.brands?.split(',')[0]?.trim() || null,
    barcode: p.code ?? null,
    per_100g: completeNutrients(n, carbsExcludeFiber, sugarAlcoholType),
    unit_conversions: serving > 0 ? [{ unit: p.serving_size ? `1 serving (${p.serving_size})` : '1 serving', grams: serving }] : [],
    ingredients_text: ingredients,
    keto_notes: null,
    carbs_exclude_fiber: carbsExcludeFiber,
    source: 'database',
    confidence: n.kcal != null && n.carbs != null ? 'medium' : 'low',
    fields_estimated: [],
    meta: {
      externalId: `off:${p.code}`,
      novaGroup: p.nova_group ?? null,
      additives: p.additives_tags ?? [],
      imageUrl: p.image_front_small_url,
      sugarAlcoholType,
    },
  }
  const withMeta = withDetectedMeta(food, p.categories_tags)
  return { ...withMeta, keto_notes: ketoNotes(withMeta) }
}

/** Looks up a barcode in Open Food Facts, then in USDA's branded foods. */
export async function lookupBarcode(code: string): Promise<NewFood | null> {
  const clean = code.replace(/\D/g, '')
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=${OFF_FIELDS}`)
  if (res.ok) {
    const data = (await res.json()) as { status: number; product?: OffProduct }
    if (data.status === 1 && data.product?.nutriments && Object.keys(data.product.nutriments).length) {
      return mapOffProduct({ ...data.product, code: clean })
    }
  }
  const usda = await searchUsda(clean).catch(() => [])
  const match = usda.find((f) => f.barcode?.replace(/^0+/, '') === clean.replace(/^0+/, ''))
  return match ?? null
}

function titleCase(s: string): string {
  // USDA descriptions are often ALL CAPS; leave mixed-case text alone.
  if (s !== s.toUpperCase()) return s
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function dedupeUnits(units: UnitConversion[]): UnitConversion[] {
  const seen = new Set<string>()
  return units.filter((u) => (seen.has(u.unit) ? false : (seen.add(u.unit), true)))
}
