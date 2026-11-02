import { describe, expect, it } from 'vitest'
import type { Food } from './foods'
import { foodSheet, parseCsv, readFoodSheet } from './foodSheet'
import { portionText, servingOf } from './quickFoods'

const food = (over: Partial<Food> = {}): Food => ({
  id: 'egg',
  name: 'Egg Whites',
  brand: 'Kirkland Signature',
  barcode: '0096619',
  per_100g: { kcal: 52, protein: 11, fat: 0, carbs: 0.7, fiber: 0, netCarbs: 0.7 },
  unit_conversions: [{ unit: '1 serving (3 tbsp (46 g))', grams: 46 }],
  ingredients_text: 'Egg whites',
  keto_notes: null,
  carbs_exclude_fiber: false,
  source: 'database',
  confidence: 'high',
  fields_estimated: [],
  favorite: false,
  use_count: 3,
  last_used_at: null,
  meta: {},
  updated_at: '',
  deleted_at: null,
  ...over,
})

/** The sheet with one cell changed, as a spreadsheet app would save it. */
const edit = (csv: string, head: string, value: string) => {
  const [h, ...rows] = parseCsv(csv)
  const i = h.findIndex((x) => x.replace(/^﻿/, '').startsWith(head))
  rows[0][i] = value
  return [h, ...rows].map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
}

describe('usual portion', () => {
  it('logs 6 oz of Kirkland egg whites unless you pick another portion', () => {
    expect(servingOf(food())).toEqual({ amount: 6, unit: 'oz' })
    expect(portionText(6 * 0.5, 'oz')).toBe('3 oz')
    expect(servingOf(food({ meta: { portion: { amount: 0, unit: '' } } }))).toEqual({ amount: 1, unit: '1 serving (3 tbsp (46 g))' })
    expect(servingOf(food({ brand: 'Vital Farms' }))).toEqual({ amount: 1, unit: '1 serving (3 tbsp (46 g))' })
    expect(servingOf(food({ meta: { portion: { amount: 2, unit: '1 serving (3 tbsp (46 g))' } } }))).toEqual({ amount: 2, unit: '1 serving (3 tbsp (46 g))' })
  })
})

describe('foods spreadsheet', () => {
  it('round-trips with nothing changed', () => {
    const foods = [food(), food({ id: 'b', name: 'Almonds, raw', brand: null, favorite: true, meta: { meals: ['snack'] } })]
    const csv = foodSheet(foods, [])
    expect(csv.split('\n')[0]).toContain('display name')
    expect(readFoodSheet(csv, foods, [])).toEqual({ changes: [], problems: [] })
  })

  it('reads edits, works out net carbs again, and lists what changed', () => {
    const foods = [food()]
    let csv = foodSheet(foods, [])
    csv = edit(csv, 'display name', 'Kirk Egg Whites')
    csv = edit(csv, 'carbs g /100g', '1.5')
    csv = edit(csv, 'fiber g /100g', '0.5')
    csv = edit(csv, 'usual meals', 'Breakfast; snack')
    csv = edit(csv, 'favorite', 'yes')
    const { changes, problems } = readFoodSheet(csv, foods, [])
    expect(problems).toEqual([])
    const after = changes[0].after
    expect(after.meta.buttonName).toBe('Kirk Egg Whites')
    expect(after.per_100g.netCarbs).toBeCloseTo(1)
    expect(after.meta.meals).toEqual(['breakfast', 'snack'])
    expect(after.favorite).toBe(true)
    expect(changes[0].changes).toContain('display name: — → Kirk Egg Whites')
  })

  it('ignores number formatting and reports cells it can’t read', () => {
    const foods = [food()]
    let csv = edit(foodSheet(foods, []), 'kcal /100g', '52.0')
    expect(readFoodSheet(csv, foods, []).changes).toEqual([])
    csv = edit(csv, 'usual meals', 'brunch')
    csv = edit(csv, 'usual portion', '6 cups of tea')
    const r = readFoodSheet(csv, foods, [])
    expect(r.changes).toEqual([])
    expect(r.problems).toHaveLength(2)
  })

  it('sets a usual portion and deletes on request', () => {
    const foods = [food({ brand: null, name: 'Greek yogurt' })]
    const csv = edit(foodSheet(foods, []), 'usual portion', '150 g')
    expect(readFoodSheet(csv, foods, []).changes[0].after.meta.portion).toEqual({ amount: 150, unit: 'g' })
    const egg = [food()]
    expect(parseCsv(foodSheet(egg, []))[1]).toContain('6 oz')
    expect(readFoodSheet(edit(foodSheet(egg, []), 'usual portion', ''), egg, []).changes[0].after.meta.portion).toEqual({ amount: 0, unit: '' })
    const del = edit(foodSheet(foods, []), 'delete', 'yes')
    expect(readFoodSheet(del, foods, []).changes[0].remove).toBe(true)
  })

  it('refuses another kind of file', () => {
    expect(readFoodSheet('date,kcal\n2026-11-01,1800\n', [food()], []).problems[0]).toMatch(/isn’t the foods sheet/)
  })
})
