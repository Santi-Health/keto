import { GRAMS_PER_OZ, toGrams } from './units'
import type { Food, LogEntry } from './foods'
import type { NutrientKey, Nutrients } from './nutrients'

// --- Short names for food buttons -----------------------------------------------------------

/** USDA-style first words that read better after the next part: "Cheese, cream" → "Cream cheese". */
const APPEND = new Set(['cheese', 'oil', 'butter', 'sauce', 'milk', 'yogurt', 'bread'])
/** USDA-style first words that are just a category: "Nuts, macadamia nuts, raw" → "Macadamia nuts". */
const CATEGORY = new Set(['nuts', 'seeds', 'fish', 'spices', 'beverages', 'snacks', 'vegetables', 'fruits', 'cereals', 'crustaceans', 'mollusks'])

/** Words that name the food itself in a long product name. */
const NOUNS =
  /^(bread|bagels?|buns?|rolls?|tortillas?|wraps?|yogurt|milk|cheese|butter|eggs?|salmon|tuna|chicken|turkey|beef|steak|pork|ham|bacon|sausages?|jerky|shrimp|avocados?|nuts|almonds|bars?|shakes?|powder|chips|crackers|cookies|cereal|granola|sauce|soup|salad|chocolate|coffee|tea|kefir|cream|oil|pasta|noodles|rice|pizza|burgers?|patties|meatballs)$/i

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** Short all-caps words that are real abbreviations, kept as they are. */
const ACRONYMS = new Set(['USDA', 'MCT', 'BBQ', 'ALMI', 'DHA', 'EPA'])
/**
 * No shouting in names: "CANADIAN BACON" → "Canadian Bacon", "Keto Bread (SOLA)" → "Keto Bread (Sola)".
 * Short capitals like "BF" or "TJ" stay, being the user's own short forms.
 */
export const unshout = (s: string) =>
  s.replace(/\b[A-Z][A-Z']{2,}\b/g, (w) => (ACRONYMS.has(w) || (w.length < 4 && /[a-z]/.test(s)) ? w : w.charAt(0) + w.slice(1).toLowerCase()))

/**
 * Names chosen for specific foods, matched on brand + name (the button says these instead of a guess).
 * `brand`: the food's brand must match it, or the food has no brand.
 */
const NAMED: { match: RegExp; brand?: RegExp; name: string }[] = [
  { match: /\blight mayo/, brand: /best foods|hellmann/, name: 'BF Light Mayo' },
  { match: /\bketchup\b/, brand: /heinz/, name: 'Heinz Ketchup' },
  { match: /\bnu ?salt\b/, name: 'NuSalt' },
  { match: /\bcanadian bacon\b/, name: 'Canadian Bacon' },
  { match: /\bprotein sushi roll/, name: 'Protein Sushi Roll' },
  { match: /\bbrat(s|wurst)?\b/, brand: /johnsonville/, name: 'Johnsonville Brats Original' },
  { match: /\boutside skirt\b/, name: 'Outside Skirt' },
  { match: /\bketo\b.*\bsoft white\b|\bsoft white\b.*\bketo\b/, brand: /nature'?s own/, name: 'Nat Own Keto Bread' },
  { match: /\begg whites?\b/, brand: /kirkland/, name: 'Kirk Egg Whites' },
]

/** The display name on buttons: the one you set, a name chosen for that food, or a short version of the full name. */
export function shortName(food: Pick<Food, 'name' | 'brand' | 'meta'>): string {
  if (food.meta.buttonName?.trim()) return food.meta.buttonName.trim()
  return namedFor(food) ?? autoName(food)
}

function namedFor(food: Pick<Food, 'name' | 'brand'>): string | null {
  const full = `${food.brand ?? ''} ${food.name}`.toLowerCase()
  return NAMED.find((r) => r.match.test(full) && (!r.brand || !food.brand || r.brand.test(food.brand.toLowerCase())))?.name ?? null
}

/** Brand short forms you've used in display names; your own renames add to these. */
const BRAND_PREFIXES: Record<string, string> = { 'best foods': 'BF', kirkland: 'Kirk', "nature's own": 'Nat Own', natures: 'Nat Own', heinz: 'Heinz', johnsonville: 'Johnsonville' }
/** "Kirkland Signature" → "kirkland": brands compare on their first word (two for "Best Foods", "Nature's Own"). */
const brandKey = (brand: string) => {
  const words = brand.toLowerCase().replace(/[^a-z' ]/g, '').trim().split(/\s+/)
  return BRAND_PREFIXES[words.slice(0, 2).join(' ')] != null ? words.slice(0, 2).join(' ') : words[0]
}

/**
 * Brand short forms learned from your display names: a food named "Kirk Egg Whites" whose automatic
 * name is "Egg Whites" teaches that Kirkland is "Kirk".
 */
export function learnedPrefixes(foods: Pick<Food, 'name' | 'brand' | 'meta'>[]): Record<string, string> {
  const out = { ...BRAND_PREFIXES }
  for (const f of foods) {
    const shown = f.meta.buttonName?.trim()
    if (!shown || !f.brand) continue
    const base = autoName(f)
    if (shown.length > base.length && shown.toLowerCase().endsWith(base.toLowerCase())) out[brandKey(f.brand)] = shown.slice(0, -base.length).trim()
  }
  return out
}

/** The display name to suggest when logging or editing: your brand short form in front of the short name. */
export function suggestDisplayName(food: Pick<Food, 'name' | 'brand' | 'meta'>, prefixes: Record<string, string>): string {
  const named = namedFor(food)
  if (named) return named
  const base = autoName(food)
  const prefix = food.brand ? prefixes[brandKey(food.brand)] : undefined
  return prefix && !base.toLowerCase().startsWith(prefix.toLowerCase()) ? `${prefix} ${base}` : base
}

/** A two-or-three word name from the full name: "Sola Sweet & Buttery Keto Bread" → "Keto Bread". */
function autoName(food: Pick<Food, 'name' | 'brand'>): string {
  let name = unshout(food.name).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  // Oikos cups go by their flavor: "Oikos Triple Zero Banana Cream Greek Yogurt" → "Oikos Banana Cream".
  if (/\boikos\b/i.test(name)) {
    const flavor = name.replace(/\b(oikos|triple|zero|pro|greek|nonfat|non-fat|blended|yogh?urt|cultured|dairy|product|cup)\b/gi, ' ').replace(/[,\s]+/g, ' ').trim()
    return `Oikos ${flavor.split(' ').slice(0, 2).join(' ')}`.trim()
  }
  // A brand repeated at the start of the name adds nothing on the button.
  if (food.brand && name.toLowerCase().startsWith(food.brand.toLowerCase())) name = name.slice(food.brand.length).replace(/^[\s,:-]+/, '')
  const segs = name.split(/\s*,\s*|\s+-\s+/).filter(Boolean)
  if (segs.length > 1 && !segs[0].includes(' ')) {
    const first = segs[0].toLowerCase()
    if (APPEND.has(first)) name = `${segs[1]} ${first}`
    else if (CATEGORY.has(first)) name = segs[1]
    else name = segs[0]
  } else name = segs[0] ?? name
  const words = name.split(' ')
  if (words.length > 3) {
    // Long product names: the first food word and the one before it ("Greek yogurt", "Keto Bread"), else the last two words.
    const i = words.findIndex((w) => NOUNS.test(w))
    name = (i >= 0 ? words.slice(Math.max(0, i - 1), i + 1) : words.slice(-2)).join(' ')
  }
  return cap(name.trim()) || food.name
}

/** Brand to show under each button's name, only where two buttons would otherwise read the same. */
export function brandsToShow(foods: Pick<Food, 'id' | 'name' | 'brand' | 'meta'>[]): Record<string, string> {
  const byName = new Map<string, typeof foods>()
  for (const f of foods) {
    const k = shortName(f).toLowerCase()
    byName.set(k, [...(byName.get(k) ?? []), f])
  }
  const out: Record<string, string> = {}
  for (const group of byName.values()) if (group.length > 1) for (const f of group) if (f.brand) out[f.id] = f.brand
  return out
}

// --- Fruits & nuts -------------------------------------------------------------------------

const FRUIT_NUT =
  /\b(berr(y|ies)|strawberr|blueberr|raspberr|blackberr|cranberr|apples?|bananas?|oranges?|clementines?|mandarins?|lemons?|limes?|grapes?|melon|watermelon|cantaloupe|cherr(y|ies)|peach(es)?|pears?|plums?|kiwi|mango(es)?|pineapple|papaya|figs?|dates|coconut|almonds?|walnuts?|pecans?|macadamias?|cashews?|pistachios?|hazelnuts?|brazil nuts?|peanuts?|pine nuts?|nuts|chia|flax(seed)?|pumpkin seeds?|pepitas|sunflower seeds?|hemp seeds?|olives?|capers?)/i
/** Foods made from fruit or nuts that aren't eaten as fruit or nuts. */
const NOT_FRUIT_NUT = /\b(milk|flour|bread|crust|cake|cookie|muffin|bar|oil|juice|yogurt|yoghurt|oikos|skyr|kefir|ice cream|chocolate|cereal|granola|sauce|dressing)\b/i

/** Yogurts, including brands whose names don't say so ("Oikos Triple Zero Banana Cream"). */
export const YOGURT = /\b(yogh?urt|oikos|skyr|chobani|fage|siggi'?s?|kefir|activia|ratio)\b/i

// --- Condiments ----------------------------------------------------------------------------

const CONDIMENT =
  /\b(mayo(nnaise)?|aioli|ketchup|catsup|mustard|hot sauce|sriracha|tabasco|cholula|buffalo sauce|bbq sauce|barbecue sauce|soy sauce|tamari|coconut aminos|fish sauce|worcestershire|teriyaki|salsa|pico de gallo|chimichurri|pesto|tahini|relish|horseradish|wasabi|ranch|dressing|vinaigrette|vinegar|lemon juice|lime juice|salt|nusalt|pepper(corns)?|seasoning|spices?|everything bagel|garlic powder|onion powder|paprika|cumin|oregano|cinnamon|chili flakes|red pepper flakes|sweetener|stevia|monk fruit|allulose|erythritol|(olive|avocado|coconut|mct|sesame|canola|sunflower|cooking|vegetable) oil)\b/i
/** "Pepper" the seasoning, not bell or jalapeño peppers; olive oil, not tuna in olive oil. */
const NOT_CONDIMENT = /\bin (\w+ )?oil\b|\b(bell|jalape[nñ]o|poblano|sweet|stuffed|roasted|chicken|steak|beef|salmon|pork|bread|chips|nuts|almonds)\b/i
/** Butter and spreads that go on or in things; "sweet cream butter" counts, nut butters and baked goods don't. */
const SPREAD = /\b(butter|ghee|cream cheese|cheese, cream|philadelphia|sour cream)\b/i
const NOT_SPREAD = /\b(peanut|almond|cashew|sunflower|nut|seed|apple|cookies?|bread|cake|crackers?|popcorn|chicken|sauce)\b/i

// --- Picada: cheese, cold meats and olives ------------------------------------------------

const PICADA =
  /\b(cheeses?|brie|camembert|manchego|gouda|cheddar|parmesan|parmigiano|pecorino|gruy[eè]re|comt[eé]|mozzarella|burrata|feta|provolone|havarti|emmental|swiss|roquefort|gorgonzola|stilton|halloumi|queso|salami|prosciutto|jam[oó]n|serrano|chorizo|mortadella|pepperoni|soppressata|sopressata|bresaola|coppa|capicola|pastrami|lomo|salchich[oó]n|deli (ham|turkey)|sliced (ham|turkey)|ham|olives?|capers?)\b/i
/** Cheese and meats that aren't for a picada: spreads, cheese in dishes, cooked ham steaks. */
const NOT_PICADA = /\b(cream cheese|cottage|ricotta|mascarpone|sauce|dressing|crackers|chips|crisps|bites|puffs|curls|whisps|pizza|burger|omelet|quesadilla|soup|bread|oil|steak|hamburger|powder|grated)\b/i

export type FoodSection = 'fruits_nuts' | 'picada' | 'condiments'
/** Bottom sections, top to bottom; Condiments is last. */
export const SECTIONS: { key: FoodSection; title: string }[] = [
  { key: 'fruits_nuts', title: 'Fruits & nuts' },
  { key: 'picada', title: 'Picada' },
  { key: 'condiments', title: 'Condiments' },
]

/**
 * Which bottom sections a food goes in: the ones you chose, or recognized by name. A food can be in more
 * than one (olives are fruit and picada); a condiment isn't also a fruit or nut ("coconut aminos").
 */
export function sectionsOf(food: Pick<Food, 'name' | 'meta' | 'source'>): FoodSection[] {
  if (food.meta.sections) return food.meta.sections
  // Chosen before foods could be in several sections.
  if (food.meta.group) return food.meta.group === 'other' ? [] : [food.meta.group]
  if (food.source === 'recipe') return []
  const n = food.name
  const out: FoodSection[] = []
  const condiment = (CONDIMENT.test(n) && !NOT_CONDIMENT.test(n)) || (SPREAD.test(n) && !NOT_SPREAD.test(n))
  if (!condiment && FRUIT_NUT.test(n) && !NOT_FRUIT_NUT.test(n)) out.push('fruits_nuts')
  // The short name too, for USDA order: "Cheese, cream" is cream cheese.
  if (PICADA.test(n) && !NOT_PICADA.test(n) && !NOT_PICADA.test(shortName({ name: n, brand: null, meta: {} }))) out.push('picada')
  if (condiment) out.push('condiments')
  return out
}

/** Logged at this meal on at least this many of the last 30 days: often enough to show with the meal too. */
export const VERY_FREQUENT_DAYS = 4

/** Whether a food is eaten at a meal often enough to show there even though it has its own section. */
export function veryFrequentAt(
  foodId: string,
  meal: string,
  logs: { food_id: string | null; meal: string; eaten_at: string }[],
  now = Date.now(),
): boolean {
  const days = new Set<string>()
  for (const l of logs) {
    if (l.food_id !== foodId || l.meal !== meal) continue
    const t = Date.parse(l.eaten_at)
    if (now - t <= 30 * 86_400_000) days.add(new Date(t).toDateString())
  }
  return days.size >= VERY_FREQUENT_DAYS
}

// --- Icons ---------------------------------------------------------------------------------

const ICONS: [RegExp, string][] = [
  // Before the fruits, so a banana yogurt is a yogurt.
  [YOGURT, '🥣'],
  [/mayo|aioli|ketchup|mustard|sauce|sriracha|tabasco|salsa|dressing|vinaigrette|ranch|pesto|vinegar|aminos|relish|tahini|horseradish/, '🫙'],
  [/salt|black pepper|peppercorn|seasoning|spice|paprika|cumin|oregano|cinnamon|flakes/, '🧂'],
  [/blueberr|blackberr/, '🫐'],
  [/strawberr|raspberr|berr/, '🍓'],
  [/cherr/, '🍒'],
  [/apple/, '🍎'],
  [/banana/, '🍌'],
  [/lemon|lime/, '🍋'],
  [/orange|clementine|mandarin/, '🍊'],
  [/grape/, '🍇'],
  [/melon/, '🍈'],
  [/peach/, '🍑'],
  [/pear\b|pears/, '🍐'],
  [/kiwi/, '🥝'],
  [/mango/, '🥭'],
  [/pineapple/, '🍍'],
  [/coconut/, '🥥'],
  [/peanut/, '🥜'],
  [/almond|walnut|pecan|macadamia|cashew|pistachio|hazelnut|nut\b|nuts\b/, '🌰'],
  [/olive oil|oil\b/, '🫗'],
  [/olive/, '🫒'],
  [/avocado|guac/, '🥑'],
  [/egg/, '🥚'],
  [/bacon/, '🥓'],
  [/salmon|tuna|fish|sardine|cod|trout|anchov/, '🐟'],
  [/shrimp|prawn/, '🦐'],
  [/crab|lobster/, '🦀'],
  [/chicken|turkey/, '🍗'],
  [/prosciutto|jam[oó]n|serrano|mortadella|pepperoni|soppressata|bresaola|coppa|capicola|pastrami|salchich/, '🥓'],
  [/steak|beef|burger|lamb|pork|ham\b|sausage|chorizo|salami|meat/, '🥩'],
  [/butter/, '🧈'],
  [/cheese|mozzarella|cheddar|parmesan|brie|feta/, '🧀'],
  [/milk|cream\b/, '🥛'],
  [/bread|toast|bun\b|roll\b|bagel|tortilla|wrap/, '🍞'],
  [/broccoli|cauliflower/, '🥦'],
  [/spinach|lettuce|salad|kale|arugula|greens/, '🥬'],
  [/cucumber|pickle/, '🥒'],
  [/tomato/, '🍅'],
  [/pepper\b|peppers/, '🫑'],
  [/mushroom/, '🍄'],
  [/carrot/, '🥕'],
  [/onion|garlic/, '🧅'],
  [/chocolate|cacao|cocoa/, '🍫'],
  [/protein|whey|shake/, '💪'],
  [/soup|broth|stew/, '🍲'],
  [/salt|seasoning|spice/, '🧂'],
  [/seed|chia|flax/, '🌱'],
]

/** An emoji for a food's button, from its name; recipes get a pot. */
export function foodIcon(food: Pick<Food, 'name' | 'brand' | 'meta' | 'source'>): string {
  const full = `${food.brand ?? ''} ${food.name}`
  // A yogurt is a yogurt whatever its flavor ("Oikos Triple Zero Banana Cream").
  if (YOGURT.test(full)) return '🥣'
  // The short name first, so "Sweet & Buttery Keto Bread" is bread, not butter.
  for (const n of [shortName(food).toLowerCase(), `${food.brand ?? ''} ${food.name}`.toLowerCase()]) for (const [re, icon] of ICONS) if (re.test(n)) return icon
  return food.source === 'recipe' ? '🍲' : '🍽️'
}

// --- Nut counts ---------------------------------------------------------------------------

/** About how many are in an ounce (28 g), from USDA and the nut boards; pecans and walnuts in halves. Olives too. The name is what a portion that already counts them says. */
const PER_OZ: [RegExp, number, string][] = [
  [/almond/, 23, 'almonds'],
  [/pistachio/, 49, 'pistachios'],
  [/cashew/, 18, 'cashews'],
  [/macadamia/, 11, 'macadamias'],
  [/pecan/, 19, 'pecan halves'],
  [/walnut/, 14, 'walnut halves'],
  [/hazelnut|filbert/, 21, 'hazelnuts'],
  [/brazil nut/, 6, 'Brazil nuts'],
  [/peanut/, 28, 'peanuts'],
  // Olives by size: kalamatas are large (~4.5 g each), most jarred olives medium (~3.5 g).
  [/kalamata|castelvetrano|cerignola/, 6, 'olives'],
  [/olive/, 8, 'olives'],
]
/** Foods made from nuts that aren't counted by the nut. */
const NOT_WHOLE_NUT = /\b(butter|flour|milk|meal|oil|bar|paste|tapenade|sliced|slivered|chopped|ground|crust|cookie)\b/i

/** "~23" (almonds, olives…) for a portion of whole nuts or olives, or null for anything else. */
export function nutCount(food: Pick<Food, 'name'>, grams: number, unit = ''): string | null {
  if (NOT_WHOLE_NUT.test(food.name)) return null
  const n = food.name.toLowerCase()
  const hit = PER_OZ.find(([re]) => re.test(n))
  // A portion that already counts them ("5 olives") needs no estimate.
  if (!hit || unit.toLowerCase().includes(hit[2].split(' ')[0].replace(/s$/, ''))) return null
  const count = Math.round((grams / 28.35) * hit[1])
  return count > 0 ? `~${count}` : null
}

/** "~23 almonds" for a portion of whole nuts or olives, or null for anything else. */
export function nutCountWords(food: Pick<Food, 'name'>, grams: number, unit = ''): string | null {
  const count = nutCount(food, grams, unit)
  return count && `${count} ${PER_OZ.find(([re]) => re.test(food.name.toLowerCase()))![2]}`
}

// --- Portions ------------------------------------------------------------------------------

const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' }
/** 1.5 → "1½", 0.5 → "½", 2 → "2". */
export function frac(n: number): string {
  const whole = Math.floor(n)
  const part = FRACTIONS[String(Math.round((n - whole) * 100) / 100)]
  if (part) return `${whole || ''}${part}`
  return String(Math.round(n * 100) / 100)
}

/** Usual portions for specific foods, when no portion was set on the food itself. */
const USUAL_PORTIONS: { match: RegExp; brand?: RegExp; amount: number; unit: string }[] = [{ match: /\begg whites?\b/, brand: /kirkland/, amount: 6, unit: 'oz' }]

/** The portion the food's own setting or a usual-portion rule gives, if any. */
export function setPortionOf(food: Partial<Pick<Food, 'name' | 'brand' | 'meta'>>): { amount: number; unit: string } | null {
  // A portion of 0 means you chose the label serving, over any rule.
  if (food.meta?.portion) return food.meta.portion.amount ? food.meta.portion : null
  const full = `${food.brand ?? ''} ${food.name ?? ''}`.toLowerCase()
  const rule = USUAL_PORTIONS.find((r) => r.match.test(full) && (!r.brand || r.brand.test(full)))
  return rule ? { amount: rule.amount, unit: rule.unit } : null
}

const SALT = /\bsalt\b/
const PEPPER = /\b(pepper|peppercorns?)\b/
const NUSALT = /\bnu[ -]?salt\b/
/** Vegetables and dishes that have the word in their name. */
const NOT_SEASONING = /\b(red|green|yellow|orange) peppers?\b(?! flakes)|\b(jack|cheese|sauce|turkey|crackers|butter|pizza)\b/i
/** Flavored salts, which aren't what goes on eggs. */
const FLAVORED_SALT = /\b(garlic|onion|celery|seasoned|lemon|herb)\b/i
/** The most a pinch of seasoning can weigh; anything more is a mistake, like the 100 g default. */
const MAX_SEASONING_G = 5

/** Salt, pepper or NuSalt, used by the pinch. */
export function isSeasoning(food: { name?: string; source?: Food['source'] }): boolean {
  const n = (food.name ?? '').toLowerCase()
  return food.source !== 'recipe' && (SALT.test(n) || PEPPER.test(n) || NUSALT.test(n)) && !NOT_CONDIMENT.test(n) && !NOT_SEASONING.test(n)
}

/** Salt or pepper logged by the handful, which only happens by mistake (the old 100 g default). */
export function oversizedSeasonings<L extends Pick<LogEntry, 'food_id' | 'food_name' | 'grams'>>(logs: L[], foodById: Record<string, Pick<Food, 'source'>>): L[] {
  return logs.filter((l) => l.grams > MAX_SEASONING_G && isSeasoning({ name: l.food_name, source: l.food_id ? foodById[l.food_id]?.source : undefined }))
}

/** The entry at another weight, in the same unit, with its nutrients scaled to match. */
export function resized<L extends Pick<LogEntry, 'amount' | 'unit' | 'grams' | 'nutrients'>>(entry: L, grams: number): L {
  const ratio = grams / entry.grams
  const nutrients: Nutrients = {}
  for (const [k, v] of Object.entries(entry.nutrients) as [NutrientKey, number][]) nutrients[k] = k.endsWith('Servings') ? v : v * ratio
  return { ...entry, amount: Math.round(entry.amount * ratio * 100) / 100, grams, nutrients }
}

/** The entry as a 1 g pinch. */
export const asPinch = <L extends Pick<LogEntry, 'amount' | 'unit' | 'grams' | 'nutrients'>>(entry: L): L => ({ ...resized(entry, 1), amount: 1, unit: 'g' })

/** The food's serving to log by default: the portion set for it ("6 oz"), its first portion ("1 slice"), else 100 g. Salt and pepper are 1 g. */
export function servingOf(food: Pick<Food, 'unit_conversions'> & Partial<Pick<Food, 'name' | 'brand' | 'meta' | 'source'>>): { amount: number; unit: string } {
  const set = setPortionOf(food)
  if (isSeasoning(food)) return set && toGrams({ unitConversions: food.unit_conversions }, set.amount, set.unit).grams <= MAX_SEASONING_G ? set : { amount: 1, unit: 'g' }
  if (set) return set
  const first = food.unit_conversions[0]
  return first && first.unit !== 'g' ? { amount: 1, unit: first.unit } : { amount: 100, unit: 'g' }
}

// --- Pairings ------------------------------------------------------------------------------

const AVOCADO_OIL = /\bavocado oil\b/
export const isAvocadoOil = (f: Pick<Food, 'name'>) => AVOCADO_OIL.test(f.name.toLowerCase()) && !/\bmayo/i.test(f.name)
export const isPlainSalt = (f: Pick<Food, 'name'> & Partial<Pick<Food, 'source'>>) => saltKind(f) === 'salt' && isSeasoning(f) && !FLAVORED_SALT.test(f.name)
export const isPepper = (f: Pick<Food, 'name'> & Partial<Pick<Food, 'source'>>) => PEPPER.test(f.name.toLowerCase()) && !SALT.test(f.name.toLowerCase()) && isSeasoning(f)
/** What each pairing finds among your foods, by name, so a food moved out of Condiments still counts. */
const PAIR_PICK: [RegExp, (f: Pick<Food, 'name' | 'meta' | 'source'>) => boolean][] = [
  [AVOCADO_OIL, isAvocadoOil],
  [SALT, isPlainSalt],
  [PEPPER, isPepper],
  [NUSALT, () => true],
]

/** Meat, fish and vegetables you cook and salt; not cured or ready-made foods, which come salted. */
const COOKED =
  /\b(steak|skirt|ribeye|sirloin|flank|brisket|beef|ground (beef|turkey|pork)|chicken|turkey|pork|lamb|veal|chops?|salmon|cod|tilapia|halibut|trout|fish|shrimp|scallops?|broccoli|cauliflower|zucchini|asparagus|spinach|kale|mushrooms?|green beans|brussels|cabbage|bok choy|eggplant)\b/
const SALTED_ALREADY = /\b(bacon|ham|sausages?|brats?|bratwurst|jerky|deli|sliced|smoked|canned|salami|pepperoni|nuggets|tenders|sushi|soup|chips|salad)\b/

/**
 * Foods that always go in with another: eggs and egg whites in avocado oil with NuSalt, salt and pepper;
 * anything cooked with NuSalt and salt.
 */
const PAIR_RULES: { match: RegExp; not?: RegExp; with: RegExp[] }[] = [
  { match: /\begg whites?\b/, with: [NUSALT, SALT, AVOCADO_OIL, PEPPER] },
  { match: /\beggs?\b/, not: /\bwhites?\b|eggplant|salad|bites?|noodles?|nog\b/, with: [NUSALT, SALT, AVOCADO_OIL, PEPPER] },
  { match: COOKED, not: SALTED_ALREADY, with: [NUSALT, SALT] },
]

/** Salt or NuSalt, or neither. */
export function saltKind(f: Pick<Food, 'name'>): 'salt' | 'nusalt' | null {
  const n = f.name.toLowerCase()
  return NUSALT.test(n) ? 'nusalt' : SALT.test(n) ? 'salt' : null
}

type Pairable = Pick<Food, 'id' | 'name' | 'brand' | 'meta' | 'source' | 'use_count'>

/** The foods logged along with this one. Eggs always get their four, plus any you added; other foods get the ones you chose, else the usual pairings (most used first). */
export function pairsFor<F extends Pairable>(food: Pick<Food, 'id' | 'name' | 'brand' | 'meta'> & Partial<Pick<Food, 'source'>>, foods: F[]): F[] {
  const full = `${food.brand ?? ''} ${food.name}`.toLowerCase()
  const rule = PAIR_RULES.find((r) => r.match.test(full) && !r.not?.test(full))
  const chosen = (food.meta.pairs ?? []).map((id) => foods.find((f) => f.id === id)).filter((f): f is F => !!f)
  const isEggs = rule === PAIR_RULES[0] || rule === PAIR_RULES[1]
  if (food.meta.pairs && !isEggs) return chosen
  // A recipe has its salt in its ingredients.
  if (food.source === 'recipe' || !rule) return []
  const out: F[] = []
  for (const re of rule.with) {
    const ok = PAIR_PICK.find(([r]) => r === re)![1]
    const hit = foods
      .filter((f) => f.id !== food.id && re.test(f.name.toLowerCase()) && ok(f) && !out.includes(f))
      .sort((a, b) => b.use_count - a.use_count)[0]
    if (hit) out.push(hit)
  }
  return [...out, ...chosen.filter((f) => !out.includes(f))]
}

/** Adds to what's in brackets, or starts them: "1 serv. (3 slices)" → "1 serv. (3 slices, 56 g)". */
export const withNote = (text: string, note: string) => (text.endsWith(')') ? `${text.slice(0, -1)}, ${note})` : `${text} (${note})`)

const round1 = (n: number) => Math.round(n * 10) / 10
const fmtGrams = (g: number) => `${g < 10 ? round1(g) : Math.round(g)} g`
/** Measures a drink is poured in, where a weight only adds clutter. */
const NO_WEIGHT = /^(ml|fl oz|cup|tbsp|tsp|shot|can|pod|bottle)$/
/** Below this, ounces would just read "0 oz". */
const MIN_G_FOR_OZ = 10

/** A portion with how much it is: "1 serv. (85 g)", "3 oz (85 g)", "150 g (5.3 oz)", "2 eggs (100 g)". */
export function sizeText(amount: number, unit: string, grams: number): string {
  const text = portionText(amount, unit)
  if (NO_WEIGHT.test(unit)) return text
  if (unit === 'g') return grams >= MIN_G_FOR_OZ ? `${text} (${round1(grams / GRAMS_PER_OZ)} oz)` : text
  return withNote(text, fmtGrams(grams))
}

/** How a portion reads on a button: "2 eggs", "½ slice", "1 serving", "150 g". */
/** Short words for portions: "serv." and "cont."; slice and can stay whole. */
const abbreviate = (s: string) => s.replace(/\bservings?\b/g, 'serv.').replace(/\bcontainers?\b/g, 'cont.')

export function portionText(amount: number, unit: string): string {
  return abbreviate(portionWords(amount, unit))
}

function portionWords(amount: number, unit: string): string {
  const m = unit.match(/^1 (.+)$/)
  // Portions that carry their own amount ("½ fruit", "2 oz", "5 berries"): as is, or "2 × 2 oz".
  // Counted containers take a plural: "2 shots", "2 cans".
  const counted = amount > 1 && /^(shot|can|pod|bottle)$/.test(unit) ? `${unit}s` : unit
  if (!m) return /^[\d½¼¾]/.test(unit) ? (amount === 1 ? unit : `${frac(amount)} × ${unit}`) : `${frac(amount)} ${counted}`
  // Weights inside a serving add clutter: "1 serving (3 slices (56 g))" → "1 serving (3 slices)".
  const serving = m[1].match(/^serving \((.*)\)$/)?.[1]?.replace(/\s*[(,]?\s*[\d.]+\s*(g|grams?|oz|ml)\)?\s*$/i, '').trim()
  if (serving && !/^1 /.test(serving)) {
    if (amount === 1) return `1 serving (${serving})`
    // Counted pieces add up: 2 servings of 3 slices is "6 slices".
    const pieces = serving.match(/^(\d+(?:\.\d+)?) ([a-z ]+)$/i)
    return pieces ? `${frac(amount * Number(pieces[1]))} ${pieces[2]}` : `${frac(amount)} servings`
  }
  // "1 serving (1 bar (40 g))" reads as the inner portion.
  const inner = m[1].match(/^serving \(1 (.*)\)$/)?.[1]
  const base = (inner ?? m[1]).replace(/\s*\([^)]*\)\s*$/, '')
  const plural = amount > 1 && !/s$/.test(base) && !/\b(oz|g|ml|tbsp|tsp)$/.test(base) ? `${base}s` : base
  return `${frac(amount)} ${plural}`
}
