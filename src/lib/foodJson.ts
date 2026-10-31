import { completeNutrients, type NewFood } from './foods'
import type { SugarAlcoholType } from './nutrition'
import type { NutrientKey, Nutrients } from './nutrients'
import type { UnitConversion } from './units'

/**
 * Food entry through Claude chat (no API key needed): the app copies a prompt, the user pastes it
 * into Claude with photos, and pastes Claude's JSON reply back. The same JSON shape will be used by
 * the built-in photo mode later.
 */

export const LABEL_PROMPT = `You are reading food packaging for my keto tracker. I'm attaching photos (front of package, nutrition facts label, ingredients).

Reply with ONLY one JSON object, no other text, in exactly this shape:
{
  "name": "product name",
  "brand": "brand or null",
  "barcode": "digits or null",
  "serving": { "label": "e.g. 1 bar, 2 tbsp, 1 cup", "grams": 40 },
  "per_100g": {
    "calories": 0, "protein_g": 0, "fat_g": 0, "sat_fat_g": 0, "trans_fat_g": 0,
    "carbs_total_g": 0, "fiber_g": 0, "sugars_g": 0, "added_sugars_g": 0,
    "sugar_alcohols": [{ "type": "erythritol|allulose|xylitol|maltitol|sorbitol|glycerin|other", "g": 0 }],
    "sodium_mg": 0, "potassium_mg": 0, "magnesium_mg": 0,
    "cholesterol_mg": null, "calcium_mg": null, "iron_mg": null, "caffeine_mg": null,
    "vitamin_d_ug": null, "vitamin_c_mg": null, "vitamin_a_ug": null, "vitamin_b12_ug": null, "folate_ug": null, "zinc_mg": null
  },
  "unit_conversions": [{ "unit": "1 piece", "grams": 40 }],
  "ingredients_text": "full ingredients or null",
  "sweeteners": ["sucralose", "..."],
  "keto_notes": "hidden sugars, maltitol, starches, seed oils, anything that matters on keto",
  "source": "label_photo",
  "confidence": "high|medium|low",
  "fields_estimated": ["potassium_mg", "magnesium_mg"]
}

Rules:
- Convert every value from the label's per-serving numbers to per 100 g (or per 100 ml for drinks).
- US labels include fiber in total carbs; report total carbs as printed.
- Labels often omit potassium and magnesium: estimate them from the ingredients and similar foods, and list every estimated field in "fields_estimated".
- If the label is unreadable, say so in "keto_notes", estimate from similar products, set "source" to "ai_estimate" and "confidence" to "low".
- "sweeteners" lists artificial sweeteners only (sucralose, aspartame, acesulfame K, saccharin…), not stevia or monk fruit.`

export const RESTAURANT_PROMPT = `You are estimating a restaurant dish for my keto tracker. I'm attaching a photo of the menu item (description and calories if shown) and/or the plate.

Reply with ONLY one JSON object, no other text, in exactly this shape:
{
  "name": "dish name",
  "restaurant": "restaurant or null",
  "menu_calories": null,
  "ingredients": ["6 oz grilled salmon", "1 tbsp butter", "1 cup asparagus"],
  "hidden_carbs": ["teriyaki glaze (~8 g sugar)"],
  "confidence": "high|medium|low",
  "notes": "anything that affects the estimate"
}

Rules:
- One ingredient per line with an amount and a unit I can weigh or measure: g, oz, cup, tbsp, tsp, or a count ("2 eggs").
- Use plain grocery names ("salmon fillet", "white rice", "olive oil"), not menu wording.
- If the menu shows calories, scale portions so the total matches, and put that number in "menu_calories".
- Include cooking fats, sauces, dressings, glazes and breading; list likely hidden carbs separately in "hidden_carbs".`

/** Pulls the first JSON object out of a reply that may include code fences or extra text. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error("That doesn't look like JSON. Paste Claude's whole reply, starting with {.")
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    throw new Error("The JSON is incomplete or has a typo. Ask Claude to resend it as one valid JSON object.")
  }
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** JSON field → app nutrient key. */
const FIELD_MAP: Record<string, NutrientKey> = {
  calories: 'kcal',
  protein_g: 'protein',
  fat_g: 'fat',
  sat_fat_g: 'satFat',
  trans_fat_g: 'transFat',
  carbs_total_g: 'carbs',
  fiber_g: 'fiber',
  sugars_g: 'sugars',
  added_sugars_g: 'addedSugars',
  sodium_mg: 'sodiumMg',
  potassium_mg: 'potassiumMg',
  magnesium_mg: 'magnesiumMg',
  cholesterol_mg: 'cholesterolMg',
  calcium_mg: 'calciumMg',
  iron_mg: 'ironMg',
  vitamin_d_ug: 'vitDUg',
  vitamin_c_mg: 'vitCMg',
  vitamin_a_ug: 'vitAUg',
  vitamin_b12_ug: 'b12Ug',
  folate_ug: 'folateUg',
  zinc_mg: 'zincMg',
  caffeine_mg: 'caffeineMg',
}

const SUGAR_ALCOHOL_TYPES: SugarAlcoholType[] = ['erythritol', 'allulose', 'xylitol', 'sorbitol', 'maltitol', 'glycerin', 'other']

/** Turns Claude's label JSON into an unsaved food for the review form. */
export function parseLabelJson(text: string): NewFood {
  const j = extractJson(text) as Record<string, unknown>
  const name = str(j.name)
  if (!name) throw new Error('The JSON has no "name". Ask Claude to include the product name.')
  const p = (j.per_100g ?? {}) as Record<string, unknown>
  const per100: Nutrients = {}
  for (const [field, key] of Object.entries(FIELD_MAP)) {
    const v = num(p[field])
    if (v != null) per100[key] = v
  }
  if (per100.kcal == null && per100.protein == null && per100.fat == null && per100.carbs == null)
    throw new Error('No nutrition values found in "per_100g". Ask Claude to fill them in.')

  const alcohols = Array.isArray(p.sugar_alcohols) ? (p.sugar_alcohols as Record<string, unknown>[]) : []
  const alcoholG = alcohols.reduce((s, a) => s + (num(a.g) ?? 0), 0)
  const firstType = str(alcohols.find((a) => (num(a.g) ?? 0) > 0)?.type)?.toLowerCase() as SugarAlcoholType | undefined
  const alcoholType = firstType && SUGAR_ALCOHOL_TYPES.includes(firstType) ? firstType : alcoholG > 0 ? 'other' : undefined
  if (alcoholG > 0) per100.sugarAlcohols = alcoholG

  const units: UnitConversion[] = []
  const serving = j.serving as Record<string, unknown> | undefined
  const sg = num(serving?.grams)
  if (sg && sg > 0) units.push({ unit: str(serving?.label) ?? '1 serving', grams: sg })
  for (const u of Array.isArray(j.unit_conversions) ? (j.unit_conversions as Record<string, unknown>[]) : []) {
    const g = num(u.grams)
    const unit = str(u.unit)
    if (unit && g && g > 0 && !units.some((x) => x.unit === unit)) units.push({ unit, grams: g })
  }

  const estimated = (Array.isArray(j.fields_estimated) ? j.fields_estimated : [])
    .map((f): string | null => (typeof f === 'string' ? (FIELD_MAP[f] ?? f) : null))
    .filter((f): f is string => !!f)
  const source = j.source === 'ai_estimate' ? 'ai_estimate' : 'label_photo'
  const confidence = j.confidence === 'low' || j.confidence === 'medium' ? j.confidence : 'high'
  const sweeteners = (Array.isArray(j.sweeteners) ? j.sweeteners : []).map(str).filter((s): s is string => !!s)

  return {
    name,
    brand: str(j.brand),
    barcode: str(j.barcode)?.replace(/\D/g, '') || null,
    per_100g: completeNutrients(per100, false, alcoholType),
    unit_conversions: units,
    ingredients_text: str(j.ingredients_text),
    keto_notes: str(j.keto_notes),
    carbs_exclude_fiber: false,
    source,
    confidence,
    fields_estimated: estimated,
    meta: { sweeteners, sugarAlcoholType: alcoholType },
  }
}

export interface RestaurantDish {
  name: string
  restaurant: string | null
  menuCalories: number | null
  ingredients: string[]
  hiddenCarbs: string[]
  confidence: 'high' | 'medium' | 'low'
  notes: string | null
}

export function parseRestaurantJson(text: string): RestaurantDish {
  const j = extractJson(text) as Record<string, unknown>
  const ingredients = (Array.isArray(j.ingredients) ? j.ingredients : []).map(str).filter((s): s is string => !!s)
  if (!ingredients.length) throw new Error('The JSON has no "ingredients" list. Ask Claude to list the dish as ingredients with amounts.')
  return {
    name: str(j.name) ?? 'Restaurant dish',
    restaurant: str(j.restaurant),
    menuCalories: num(j.menu_calories) ?? null,
    ingredients,
    hiddenCarbs: (Array.isArray(j.hidden_carbs) ? j.hidden_carbs : []).map(str).filter((s): s is string => !!s),
    confidence: j.confidence === 'high' || j.confidence === 'low' ? j.confidence : 'medium',
    notes: str(j.notes),
  }
}

/** Tells the two kinds apart, so one paste box handles both. */
export const looksLikeRestaurant = (text: string) => /"ingredients"\s*:\s*\[/.test(text) && !/"per_100g"/.test(text)
