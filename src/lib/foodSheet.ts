import { isDrinkFood } from './drinks'
import { MEALS, completeNutrients, suggestForMeal, type Food, type FoodMeta, type LogEntry, type Meal } from './foods'
import type { Nutrients } from './nutrients'
import { SECTIONS, portionText, sectionsOf, servingOf, setPortionOf, shortName, veryFrequentAt, type FoodSection } from './quickFoods'
import type { UnitConversion } from './units'

/**
 * My Foods as one spreadsheet: every food and drink with its names, where it shows on Add, portions and
 * nutrition per 100 g. Edit it in Google Sheets or Excel, save as CSV, and upload it back; only the
 * columns marked editable are read back, and only changed cells are applied.
 */

/** Per-100 g nutrients in the sheet, in label order. Net carbs is worked out from carbs, fiber and sugar alcohols. */
const NUTRIENTS: { key: keyof Nutrients; head: string }[] = [
  { key: 'kcal', head: 'kcal' },
  { key: 'protein', head: 'protein g' },
  { key: 'fat', head: 'fat g' },
  { key: 'satFat', head: 'sat fat g' },
  { key: 'transFat', head: 'trans fat g' },
  { key: 'cholesterolMg', head: 'cholesterol mg' },
  { key: 'sodiumMg', head: 'sodium mg' },
  { key: 'carbs', head: 'carbs g' },
  { key: 'fiber', head: 'fiber g' },
  { key: 'sugars', head: 'sugars g' },
  { key: 'addedSugars', head: 'added sugars g' },
  { key: 'sugarAlcohols', head: 'sugar alcohols g' },
  { key: 'potassiumMg', head: 'potassium mg' },
  { key: 'magnesiumMg', head: 'magnesium mg' },
  { key: 'calciumMg', head: 'calcium mg' },
  { key: 'ironMg', head: 'iron mg' },
  { key: 'zincMg', head: 'zinc mg' },
  { key: 'seleniumUg', head: 'selenium µg' },
  { key: 'vitAUg', head: 'vitamin A µg' },
  { key: 'vitCMg', head: 'vitamin C mg' },
  { key: 'vitDUg', head: 'vitamin D µg' },
  { key: 'vitEMg', head: 'vitamin E mg' },
  { key: 'vitKUg', head: 'vitamin K µg' },
  { key: 'b6Mg', head: 'B6 mg' },
  { key: 'b12Ug', head: 'B12 µg' },
  { key: 'folateUg', head: 'folate µg' },
  { key: 'cholineMg', head: 'choline mg' },
  { key: 'omega3', head: 'omega-3 g' },
  { key: 'omega6', head: 'omega-6 g' },
  { key: 'caffeineMg', head: 'caffeine mg' },
  { key: 'alcohol', head: 'alcohol g' },
]

export interface SheetContext {
  logs: Pick<LogEntry, 'food_id' | 'meal' | 'eaten_at'>[]
  /** Food id → meals it shows under on Add today. */
  showsUnder: Map<string, Meal[]>
}

interface Column {
  head: string
  get: (f: Food, c: SheetContext) => string
  /** Editable columns read the cell back into the food. Throws with a short reason when the cell can't be read. */
  set?: (f: Food, cell: string) => Food
  /** Compare as numbers, so "0.50" and "0.5" are the same. */
  numeric?: boolean
}

const yes = (s: string) => {
  const v = s.trim().toLowerCase()
  if (['yes', 'y', 'true', '1', 'x'].includes(v)) return true
  if (['', 'no', 'n', 'false', '0'].includes(v)) return false
  throw new Error(`"${s}" isn't yes or no`)
}
const yesNo = (b: boolean) => (b ? 'yes' : '')
const list = (s: string) =>
  s
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean)

const MEAL_BY_NAME = new Map(MEALS.flatMap((m) => [[m.value, m.value] as const, [m.label.toLowerCase(), m.value] as const]))
const meals = (s: string): Meal[] =>
  list(s).map((x) => {
    const m = MEAL_BY_NAME.get(x.toLowerCase())
    if (!m) throw new Error(`"${x}" isn't a meal (breakfast, lunch, dinner, snack)`)
    return m
  })
const mealNames = (ms: Meal[] | undefined) => (ms ?? []).map((m) => MEALS.find((x) => x.value === m)!.label).join('; ')

const SECTION_BY_NAME = new Map(SECTIONS.flatMap((s) => [[s.key, s.key] as const, [s.title.toLowerCase(), s.key] as const]))
const sectionNames = (ks: FoodSection[]) => ks.map((k) => SECTIONS.find((s) => s.key === k)!.title).join('; ')

const num = (s: string): number | undefined => {
  const t = s.trim().replace(/,/g, '')
  if (!t) return undefined
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) throw new Error(`"${s}" isn't a number`)
  return n
}
const round = (n: number | undefined) => (n == null ? '' : String(Math.round(n * 1000) / 1000))

/** "1 serving (46 g)=46; 1 cup=243" */
const portionsText = (cs: UnitConversion[]) => cs.map((c) => `${c.unit}=${round(c.grams)}`).join('; ')
const parsePortions = (s: string): UnitConversion[] =>
  s
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const at = x.lastIndexOf('=')
      const unit = x.slice(0, at).trim()
      const grams = num(x.slice(at + 1))
      if (at < 1 || !unit || !grams) throw new Error(`portion "${x}" should look like "1 slice=28"`)
      return { unit, grams }
    })

/** "6 oz" → { amount: 6, unit: "oz" }; blank → the label serving. */
const parsePortion = (s: string, f: Food): FoodMeta['portion'] => {
  const t = s.trim()
  if (!t || /^label$/i.test(t)) return { amount: 0, unit: '' }
  const m = t.match(/^([\d.]+)\s*(.+)$/)
  const amount = m ? Number(m[1]) : NaN
  const unit = m?.[2].trim() ?? ''
  const units = new Set(['g', 'oz', 'ml', 'fl oz', 'cup', 'tbsp', 'tsp', ...f.unit_conversions.map((c) => c.unit)])
  if (!(amount > 0) || !units.has(unit)) throw new Error(`usual portion "${s}" should be a number and a unit it has, like "6 oz" or "1 slice"`)
  return { amount, unit }
}
const portionCell = (f: Food) => {
  const p = setPortionOf(f)
  return p ? `${round(p.amount)} ${p.unit}` : ''
}

const withMeta = (f: Food, meta: Partial<FoodMeta>): Food => ({ ...f, meta: { ...f.meta, ...meta } })

const kind = (f: Food) => (isDrinkFood(f) ? 'drink' : f.source === 'recipe' ? 'recipe' : 'food')

const COLUMNS: Column[] = [
  { head: 'id (don’t change)', get: (f) => f.id },
  { head: 'type', get: kind },
  { head: 'full name', get: (f) => f.name, set: (f, v) => ({ ...f, name: v.trim() || f.name }) },
  { head: 'display name', get: (f) => f.meta.buttonName ?? '', set: (f, v) => withMeta(f, { buttonName: v.trim() || undefined }) },
  { head: 'shows as', get: (f) => shortName(f) },
  { head: 'brand', get: (f) => f.brand ?? '', set: (f, v) => ({ ...f, brand: v.trim() || null }) },
  { head: 'favorite', get: (f) => yesNo(f.favorite), set: (f, v) => ({ ...f, favorite: yes(v) }) },
  { head: 'shows under (Add screen)', get: (f, c) => (isDrinkFood(f) ? 'Drinks' : [mealNames(c.showsUnder.get(f.id)), sectionNames(sectionsOf(f))].filter(Boolean).join('; ')) },
  { head: 'usual meals (you set)', get: (f) => mealNames(f.meta.meals), set: (f, v) => withMeta(f, { meals: meals(v) }) },
  { head: 'not usual meals (you set)', get: (f) => mealNames(f.meta.notMeals), set: (f, v) => withMeta(f, { notMeals: meals(v) }) },
  {
    head: 'sections',
    get: (f) => sectionNames(sectionsOf(f)),
    set: (f, v) =>
      withMeta(f, {
        group: undefined,
        sections: list(v).map((x) => {
          const k = SECTION_BY_NAME.get(x.toLowerCase())
          if (!k) throw new Error(`"${x}" isn't a section (${SECTIONS.map((s) => s.title).join(', ')})`)
          return k
        }),
      }),
  },
  { head: 'usual portion (e.g. 6 oz; blank = label serving)', get: portionCell, set: (f, v) => withMeta(f, { portion: parsePortion(v, f) }) },
  { head: 'one tap logs', get: (f) => portionText(servingOf(f).amount, servingOf(f).unit) },
  { head: 'portions (unit=grams; …)', get: (f) => portionsText(f.unit_conversions), set: (f, v) => ({ ...f, unit_conversions: parsePortions(v) }) },
  ...NUTRIENTS.map(
    (n): Column => ({
      head: `${n.head} /100g`,
      numeric: true,
      get: (f) => round(f.per_100g[n.key]),
      set: (f, v) => ({ ...f, per_100g: { ...f.per_100g, [n.key]: num(v) } }),
    }),
  ),
  { head: 'net carbs g /100g', get: (f) => round(f.per_100g.netCarbs) },
  { head: 'label carbs exclude fiber', get: (f) => yesNo(f.carbs_exclude_fiber), set: (f, v) => ({ ...f, carbs_exclude_fiber: yes(v) }) },
  { head: 'keto notes', get: (f) => f.keto_notes ?? '', set: (f, v) => ({ ...f, keto_notes: v.trim() || null }) },
  { head: 'ingredients', get: (f) => f.ingredients_text ?? '', set: (f, v) => ({ ...f, ingredients_text: v.trim() || null }) },
  { head: 'barcode', get: (f) => f.barcode ?? '' },
  { head: 'source', get: (f) => f.source },
  { head: 'times logged', get: (f) => String(f.use_count) },
  { head: 'last logged', get: (f) => f.last_used_at?.slice(0, 10) ?? '' },
  { head: 'delete (yes to remove)', get: () => '', set: (f) => f },
]
const DELETE = COLUMNS.length - 1

/** Which meals each food shows under on Add, the same way the Add screen picks them. */
export function showsUnder(foods: Food[], logs: Pick<LogEntry, 'food_id' | 'meal' | 'eaten_at'>[]): Map<string, Meal[]> {
  const mine = foods.filter((f) => !isDrinkFood(f))
  const out = new Map<string, Meal[]>()
  for (const { value: m } of MEALS)
    for (const f of suggestForMeal(mine, logs, m, 40))
      if (!sectionsOf(f).length || veryFrequentAt(f.id, m, logs)) out.set(f.id, [...(out.get(f.id) ?? []), m])
  return out
}

const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** The sheet as CSV: foods first, then recipes and drinks, each by name. */
export function foodSheet(foods: Food[], logs: Pick<LogEntry, 'food_id' | 'meal' | 'eaten_at'>[]): string {
  const ctx: SheetContext = { logs, showsUnder: showsUnder(foods, logs) }
  const order = { food: 0, recipe: 1, drink: 2 }
  const rows = foods.filter((f) => !f.deleted_at).sort((a, b) => order[kind(a)] - order[kind(b)] || shortName(a).localeCompare(shortName(b)))
  // A byte-order mark so Excel reads µ and accents as UTF-8.
  return '﻿' + [COLUMNS.map((c) => cell(c.head)), ...rows.map((f) => COLUMNS.map((c) => cell(c.get(f, ctx))))].map((r) => r.join(',')).join('\n') + '\n'
}

/** Reads CSV text into rows of cells (quoted cells, doubled quotes, line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else cur += ch
  }
  if (cur || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

export interface SheetChange {
  before: Food
  after: Food
  /** "display name: Egg Whites → Kirk Egg Whites" */
  changes: string[]
  remove: boolean
}

export interface SheetResult {
  changes: SheetChange[]
  problems: string[]
}

const same = (a: string, b: string, numeric?: boolean) => {
  if (numeric && a.trim() && b.trim()) return Number(a.replace(/,/g, '')) === Number(b.replace(/,/g, ''))
  return a.trim() === b.trim()
}

/** Compares an uploaded sheet with your foods: what would change, and the cells it couldn't read. */
export function readFoodSheet(text: string, foods: Food[], logs: Pick<LogEntry, 'food_id' | 'meal' | 'eaten_at'>[]): SheetResult {
  const [head, ...rows] = parseCsv(text)
  if (!head) return { changes: [], problems: ['The file is empty.'] }
  const at = new Map(head.map((h, i) => [h.trim(), i]))
  const idCol = at.get(COLUMNS[0].head)
  if (idCol == null) return { changes: [], problems: ['This isn’t the foods sheet: the first column should be “id (don’t change)”. Download a fresh one and edit that.'] }
  const ctx: SheetContext = { logs, showsUnder: showsUnder(foods, logs) }
  const byId = new Map(foods.filter((f) => !f.deleted_at).map((f) => [f.id, f]))
  const changes: SheetChange[] = []
  const problems: string[] = []
  rows.forEach((r, i) => {
    const line = i + 2
    const id = r[idCol]?.trim()
    const before = id ? byId.get(id) : undefined
    if (!before) {
      problems.push(`Row ${line}: ${id ? 'no food with this id (deleted, or the id was changed)' : 'no id; new foods can’t be added from the sheet'}. Skipped.`)
      return
    }
    let after = before
    const changed: string[] = []
    const remove = (() => {
      const i = at.get(COLUMNS[DELETE].head)
      try {
        return i != null && yes(r[i] ?? '')
      } catch {
        return false
      }
    })()
    COLUMNS.forEach((c, ci) => {
      if (!c.set || ci === DELETE) return
      const i = at.get(c.head)
      if (i == null) return
      const was = c.get(before, ctx)
      const now = r[i] ?? ''
      if (same(was, now, c.numeric)) return
      try {
        after = c.set(after, now)
        changed.push(`${c.head.replace(/ \(.*$/, '')}: ${was || '—'} → ${now.trim() || '—'}`)
      } catch (e) {
        problems.push(`Row ${line} (${shortName(before)}), ${c.head.replace(/ \(.*$/, '')}: ${(e as Error).message}. Not changed.`)
      }
    })
    if (changed.some((c) => c.includes('/100g') || c.startsWith('label carbs')))
      after = { ...after, per_100g: completeNutrients({ ...after.per_100g, netCarbs: undefined }, after.carbs_exclude_fiber, after.meta.sugarAlcoholType) }
    if (changed.length || remove) changes.push({ before, after, changes: changed, remove })
  })
  return { changes, problems }
}
