import { portionNutrients, type Food, type FoodMeta, type NewFood } from './foods'
import { addNutrients, type NutrientKey, type Nutrients } from './nutrients'
import { BASE_UNITS, toGrams } from './units'

// --- Parsing "1 1/2 cups broccoli" ----------------------------------------

const UNICODE_FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }

/** Spoken unit → app unit, with a factor for units the app doesn't log directly (kg, lb, l). */
const UNIT_ALIASES: [RegExp, string, number][] = [
  [/^(g|gr|gram|grams)$/i, 'g', 1],
  [/^(kg|kilo|kilos|kilogram|kilograms)$/i, 'g', 1000],
  [/^(oz|ounce|ounces)$/i, 'oz', 1],
  [/^(lb|lbs|pound|pounds)$/i, 'g', 453.592],
  [/^(ml|milliliter|milliliters|millilitre|millilitres)$/i, 'ml', 1],
  [/^(l|liter|liters|litre|litres)$/i, 'ml', 1000],
  [/^(cup|cups|c)$/i, 'cup', 1],
  [/^(tbsp|tbs|tablespoon|tablespoons)$/i, 'tbsp', 1],
  [/^(tsp|teaspoon|teaspoons)$/i, 'tsp', 1],
  [/^(slice|slices|piece|pieces|pc|pcs|whole|clove|cloves|stick|sticks|fillet|fillets|strip|strips|large|medium|small)$/i, 'piece', 1],
]

export interface ParsedIngredient {
  raw: string
  amount: number
  /** 'g' | 'oz' | 'ml' | 'cup' | 'tbsp' | 'tsp' | 'fl oz' | 'piece' | null (no unit given). */
  unit: string | null
  /** Words left to search for. */
  query: string
}

function parseNumber(token: string): number | null {
  if (token in UNICODE_FRACTIONS) return UNICODE_FRACTIONS[token]
  const mixed = token.match(/^(\d+)([½¼¾⅓⅔⅛])$/)
  if (mixed) return Number(mixed[1]) + UNICODE_FRACTIONS[mixed[2]]
  const frac = token.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const n = Number(token.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Reads amount, unit and food name from one ingredient line. */
export function parseIngredientLine(line: string): ParsedIngredient | null {
  const raw = line.trim().replace(/^[-•*·]\s*/, '')
  if (!raw) return null
  // "200g" and "1.5oz": split numbers glued to units.
  let tokens = raw.replace(/(\d)([a-zA-Z])/g, '$1 $2').split(/\s+/)
  let amount: number | null = null
  // Up to two number tokens: "1 1/2".
  for (let i = 0; i < 2 && tokens.length; i++) {
    const n = parseNumber(tokens[0])
    if (n == null) break
    amount = (amount ?? 0) + n
    tokens = tokens.slice(1)
  }
  if (/^(a|an)$/i.test(tokens[0] ?? '') && amount == null) {
    amount = 1
    tokens = tokens.slice(1)
  }
  let unit: string | null = null
  let factor = 1
  if (tokens[0] && /^fl$/i.test(tokens[0]) && /^oz$/i.test(tokens[1] ?? '')) {
    unit = 'fl oz'
    tokens = tokens.slice(2)
  } else if (tokens[0]) {
    const word = tokens[0].replace(/\.$/, '')
    const alias = UNIT_ALIASES.find(([re]) => re.test(word))
    if (alias) {
      unit = alias[1]
      factor = alias[2]
      tokens = tokens.slice(1)
    }
  }
  if (/^of$/i.test(tokens[0] ?? '')) tokens = tokens.slice(1)
  const query = tokens.join(' ').replace(/\(.*?\)/g, '').replace(/,.*$/, '').trim()
  if (!query) return null
  return { raw, amount: (amount ?? 1) * factor, unit, query }
}

/** Typical edible weight of one piece, for foods whose database entry has no portion sizes. */
const PIECE_GRAMS: [RegExp, number][] = [
  [/\begg/i, 50],
  [/avocado/i, 136],
  [/garlic/i, 3],
  [/bacon/i, 8],
  [/lemon|lime/i, 58],
  [/tomato/i, 123],
  [/onion/i, 110],
  [/zucchini|courgette/i, 196],
  [/bell pepper|pepper/i, 119],
  [/cucumber/i, 300],
  [/shrimp|prawn/i, 12],
  [/chicken thigh/i, 115],
  [/chicken breast/i, 175],
  [/sausage/i, 75],
  [/strawberr/i, 12],
  [/olive/i, 4],
]

export interface ResolvedAmount {
  amount: number
  unit: string
  /** True when the unit was guessed and should be checked. */
  guessed: boolean
}

/** Turns a parsed amount into one the food can be logged in. */
export function resolveAmount(food: Food | NewFood, p: Pick<ParsedIngredient, 'amount' | 'unit' | 'query'>): ResolvedAmount {
  const own = food.unit_conversions
  if (p.unit && p.unit !== 'piece' && (BASE_UNITS as readonly string[]).includes(p.unit)) {
    return { amount: p.amount, unit: p.unit, guessed: false }
  }
  // "2 eggs", "1 slice": the food's own portion if it has one.
  const portion = own.find((c) => !/serving/i.test(c.unit)) ?? own[0]
  if (portion) return { amount: p.amount, unit: portion.unit, guessed: !!p.unit && p.unit !== 'piece' }
  const typical = PIECE_GRAMS.find(([re]) => re.test(`${p.query} ${food.name}`))
  if (typical) return { amount: Number((p.amount * typical[1]).toFixed(1)), unit: 'g', guessed: true }
  // A bare number with no unit and no portion: assume grams if it's large, otherwise flag it.
  return { amount: p.amount >= 10 ? p.amount : p.amount * 100, unit: 'g', guessed: true }
}

// --- Recipe math -----------------------------------------------------------

/** A recipe line: the food (snapshot, so the recipe still works if the food is deleted) and how much. */
export interface RecipeIngredient {
  food: NewFood
  foodId: string | null
  amount: number
  unit: string
  /** The line as typed, if it came from a pasted list. */
  raw?: string
  guessed?: boolean
}

export interface RecipeMeta {
  servings: number
  /** Weight of the finished dish; cooking changes weight (water loss), so this beats summing raw weights. */
  cookedWeightG: number | null
  ingredients: RecipeIngredient[]
}

export interface RecipeTotals {
  rawGrams: number
  batchGrams: number
  servingGrams: number
  total: Required<Nutrients>
  perServing: Nutrients
  per100g: Nutrients
  approximate: boolean
  meta: Pick<FoodMeta, 'sweeteners' | 'heavyMetalRisk' | 'novaGroup' | 'partiallyHydrogenated'>
}

const asFood = (f: NewFood): Food => ({ ...f, id: '', favorite: false, use_count: 0, last_used_at: null, updated_at: '', deleted_at: null })

const isCount = (k: string) => k.endsWith('Servings')

export function computeRecipe(ingredients: RecipeIngredient[], servings: number, cookedWeightG: number | null): RecipeTotals {
  let rawGrams = 0
  let approximate = false
  const parts: Nutrients[] = []
  for (const ing of ingredients) {
    const { grams, approximate: approx } = toGrams({ unitConversions: ing.food.unit_conversions }, ing.amount, ing.unit)
    rawGrams += grams
    approximate ||= approx || !!ing.guessed
    const n = portionNutrients(asFood(ing.food), grams)
    for (const k of Object.keys(n)) if (isCount(k)) delete n[k as NutrientKey]
    parts.push(n)
  }
  const total = addNutrients(parts)
  const batchGrams = cookedWeightG && cookedWeightG > 0 ? cookedWeightG : rawGrams
  const safeServings = servings > 0 ? servings : 1
  const scale = (factor: number): Nutrients => {
    const out: Nutrients = {}
    for (const [k, v] of Object.entries(total) as [NutrientKey, number][]) if (!isCount(k)) out[k] = v * factor
    return out
  }
  const metas = ingredients.map((i) => i.food.meta)
  return {
    rawGrams,
    batchGrams,
    servingGrams: batchGrams / safeServings,
    total,
    perServing: scale(1 / safeServings),
    per100g: batchGrams > 0 ? scale(100 / batchGrams) : {},
    approximate,
    meta: {
      sweeteners: [...new Set(metas.flatMap((m) => m.sweeteners ?? []))],
      heavyMetalRisk: metas.some((m) => m.heavyMetalRisk),
      novaGroup: metas.some((m) => m.novaGroup === 4) ? 4 : null,
      partiallyHydrogenated: metas.some((m) => m.partiallyHydrogenated),
    },
  }
}

/** The recipe as a food that can be logged by the serving. Mercury is folded into its nutrients. */
export function recipeToFood(name: string, recipe: RecipeMeta, existing?: Food): NewFood | Food {
  const t = computeRecipe(recipe.ingredients, recipe.servings, recipe.cookedWeightG)
  const servingG = Number(t.servingGrams.toFixed(1))
  const base: NewFood = {
    name: name.trim() || 'Untitled recipe',
    brand: null,
    barcode: null,
    per_100g: t.per100g,
    unit_conversions: [
      { unit: '1 serving', grams: servingG },
      { unit: `whole recipe (${recipe.servings} servings)`, grams: Number(t.batchGrams.toFixed(1)) },
    ],
    ingredients_text: recipe.ingredients.map((i) => i.food.name).join(', '),
    keto_notes: null,
    carbs_exclude_fiber: false,
    source: 'recipe',
    confidence: t.approximate ? 'medium' : 'high',
    fields_estimated: t.approximate ? ['portions'] : [],
    meta: { ...existing?.meta, ...t.meta, recipe, lastAmount: 1, lastUnit: '1 serving' },
  }
  return existing ? { ...existing, ...base } : base
}

// --- Picking the right database match for an ingredient --------------------

// Words that mean "a different product" unless the ingredient line says them.
const OFF_TARGET = [
  'white', 'whites', 'yolk', 'yolks', 'substitute', 'powder', 'powdered', 'dried', 'dehydrated', 'imitation', 'baby',
  'sauce', 'soup', 'salad', 'lomi', 'smoked', 'canned', 'frozen', 'fried', 'breaded', 'flavored', 'mix', 'oil',
  'ghee', 'clarified', 'whipped', 'light', 'reduced', 'nonfat', 'juice', 'dressing', 'spread', 'sweetened',
  'chocolate', 'yogurt',
]

const singular = (w: string) => w.replace(/(ies)$/, 'y').replace(/(oes|ses|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, '')

/** Higher is a better match of a database food name for an ingredient query like "eggs" or "olive oil". */
export function scoreMatch(query: string, name: string): number {
  const q = query.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(singular)
  const n = name.toLowerCase()
  const words = n.split(/[^a-z]+/).filter(Boolean).map(singular)
  let score = 0
  for (const w of q) if (words.includes(w)) score += 3
  // USDA names lead with the main food: "Egg, whole, raw", "Fish, salmon, Atlantic".
  const lead = n.split(',').slice(0, 2).join(' ')
  if (q.every((w) => lead.includes(w))) score += 3
  if (/\braw\b/.test(n)) score += 1.5
  if (/\bwhole\b/.test(n)) score += 1
  for (const bad of OFF_TARGET) if (words.includes(singular(bad)) && !q.includes(singular(bad))) score -= 3
  return score - n.length / 60
}

export function bestIngredientMatch<T extends { name: string }>(query: string, candidates: T[]): T | undefined {
  return [...candidates].sort((a, b) => scoreMatch(query, b.name) - scoreMatch(query, a.name))[0]
}

/** True when the name adds a word that changes the product (e.g. "white" for "eggs"). */
export function isOffTarget(query: string, name: string): boolean {
  const q = query.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(singular)
  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(singular)
  return OFF_TARGET.some((bad) => words.includes(singular(bad)) && !q.includes(singular(bad)))
}
