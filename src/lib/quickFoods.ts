import type { Food } from './foods'

// --- Short names for food buttons -----------------------------------------------------------

/** USDA-style first words that read better after the next part: "Cheese, cream" → "Cream cheese". */
const APPEND = new Set(['cheese', 'oil', 'butter', 'sauce', 'milk', 'yogurt', 'bread'])
/** USDA-style first words that are just a category: "Nuts, macadamia nuts, raw" → "Macadamia nuts". */
const CATEGORY = new Set(['nuts', 'seeds', 'fish', 'spices', 'beverages', 'snacks', 'vegetables', 'fruits', 'cereals', 'crustaceans', 'mollusks'])

/** Words that name the food itself in a long product name. */
const NOUNS =
  /^(bread|bagels?|buns?|rolls?|tortillas?|wraps?|yogurt|milk|cheese|butter|eggs?|salmon|tuna|chicken|turkey|beef|steak|pork|ham|bacon|sausages?|jerky|shrimp|avocados?|nuts|almonds|bars?|shakes?|powder|chips|crackers|cookies|cereal|granola|sauce|soup|salad|chocolate|coffee|tea|kefir|cream|oil|pasta|noodles|rice|pizza|burgers?|patties|meatballs)$/i

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A two-or-three word name for a button: "Sola Sweet & Buttery Keto Bread" → "Keto Bread". */
export function shortName(food: Pick<Food, 'name' | 'brand' | 'meta'>): string {
  if (food.meta.buttonName?.trim()) return food.meta.buttonName.trim()
  let name = food.name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
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
  /\b(berr(y|ies)|strawberr|blueberr|raspberr|blackberr|cranberr|apples?|bananas?|oranges?|clementines?|mandarins?|lemons?|limes?|grapes?|melon|watermelon|cantaloupe|cherr(y|ies)|peach(es)?|pears?|plums?|kiwi|mango(es)?|pineapple|papaya|figs?|dates|coconut|almonds?|walnuts?|pecans?|macadamias?|cashews?|pistachios?|hazelnuts?|brazil nuts?|peanuts?|pine nuts?|nuts|chia|flax(seed)?|pumpkin seeds?|pepitas|sunflower seeds?|hemp seeds?|olives?)/i
/** Foods made from fruit or nuts that aren't eaten as fruit or nuts. */
const NOT_FRUIT_NUT = /\b(milk|flour|bread|crust|cake|cookie|muffin|bar|oil|juice|yogurt|ice cream|chocolate|cereal|granola|sauce|dressing)\b/i

// --- Condiments ----------------------------------------------------------------------------

const CONDIMENT =
  /\b(mayo(nnaise)?|aioli|ketchup|catsup|mustard|hot sauce|sriracha|tabasco|cholula|buffalo sauce|bbq sauce|barbecue sauce|soy sauce|tamari|coconut aminos|fish sauce|worcestershire|teriyaki|salsa|pico de gallo|chimichurri|pesto|tahini|relish|horseradish|wasabi|ranch|dressing|vinaigrette|vinegar|lemon juice|lime juice|salt|nusalt|pepper(corns)?|seasoning|spices?|everything bagel|garlic powder|onion powder|paprika|cumin|oregano|cinnamon|chili flakes|red pepper flakes|sweetener|stevia|monk fruit|allulose|erythritol|(olive|avocado|coconut|mct|sesame|canola|sunflower|cooking|vegetable) oil)\b/i
/** "Pepper" the seasoning, not bell or jalapeño peppers; olive oil, not tuna in olive oil. */
const NOT_CONDIMENT = /\bin (\w+ )?oil\b|\b(bell|jalape[nñ]o|poblano|sweet|stuffed|roasted|chicken|steak|beef|salmon|pork|bread|chips|nuts|almonds)\b/i

// --- Picada: cheese, cold meats and olives ------------------------------------------------

const PICADA =
  /\b(cheeses?|brie|camembert|manchego|gouda|cheddar|parmesan|parmigiano|pecorino|gruy[eè]re|comt[eé]|mozzarella|burrata|feta|provolone|havarti|emmental|swiss|roquefort|gorgonzola|stilton|halloumi|queso|salami|prosciutto|jam[oó]n|serrano|chorizo|mortadella|pepperoni|soppressata|sopressata|bresaola|coppa|capicola|pastrami|lomo|salchich[oó]n|deli (ham|turkey)|sliced (ham|turkey)|ham|olives?)\b/i
/** Cheese and meats that aren't for a picada: spreads, cheese in dishes, cooked ham steaks. */
const NOT_PICADA = /\b(cream cheese|cottage|ricotta|mascarpone|sauce|dressing|crackers|chips|crisps|pizza|burger|omelet|quesadilla|soup|bread|oil|steak|hamburger|powder|grated)\b/i

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
  const condiment = CONDIMENT.test(n) && !NOT_CONDIMENT.test(n)
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
  [/yogurt|kefir/, '🥣'],
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
  // The short name first, so "Sweet & Buttery Keto Bread" is bread, not butter.
  for (const n of [shortName(food).toLowerCase(), food.name.toLowerCase()]) for (const [re, icon] of ICONS) if (re.test(n)) return icon
  return food.source === 'recipe' ? '🍲' : '🍽️'
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

/** The food's serving to log by default: its first portion ("1 slice"), else 100 g. */
export function servingOf(food: Pick<Food, 'unit_conversions'>): { amount: number; unit: string } {
  const first = food.unit_conversions[0]
  return first && first.unit !== 'g' ? { amount: 1, unit: first.unit } : { amount: 100, unit: 'g' }
}

/** How a portion reads on a button: "2 eggs", "½ slice", "1 serving", "150 g". */
export function portionText(amount: number, unit: string): string {
  const m = unit.match(/^1 (.+)$/)
  // Portions that carry their own amount ("½ fruit", "2 oz", "5 berries"): as is, or "2 × 2 oz".
  if (!m) return /^[\d½¼¾]/.test(unit) ? (amount === 1 ? unit : `${frac(amount)} × ${unit}`) : `${frac(amount)} ${unit}`
  // "1 serving (1 bar (40 g))" reads as the inner portion.
  const inner = m[1].match(/^serving \(1 (.*)\)$/)?.[1]
  const base = (inner ?? m[1]).replace(/\s*\([^)]*\)\s*$/, '')
  const plural = amount > 1 && !/s$/.test(base) && !/\b(oz|g|ml|tbsp|tsp)$/.test(base) ? `${base}s` : base
  return `${frac(amount)} ${plural}`
}
