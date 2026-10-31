import { describe, expect, it } from 'vitest'
import type { Food, LogEntry } from './foods'
import { defaultMealName, itemFood, mealFromEntries, mealTotals } from './savedMeals'

const food = (id: string, kcal: number, netCarbs: number): Food => ({
  id, name: id, brand: null, barcode: null, per_100g: { kcal, netCarbs, protein: 10 }, unit_conversions: [{ unit: '1 slice', grams: 50 }],
  ingredients_text: null, keto_notes: null, carbs_exclude_fiber: false, source: 'manual', confidence: 'high', fields_estimated: [],
  favorite: false, use_count: 0, last_used_at: null, meta: {}, updated_at: '', deleted_at: null,
})
const entry = (f: Food, amount: number, unit: string): LogEntry => ({
  id: `e-${f.id}`, eaten_at: '2026-10-31T14:00:00Z', meal: 'breakfast', food_id: f.id, food_name: f.name, amount, unit, grams: 0,
  nutrients: {}, meta: {}, updated_at: '', deleted_at: null,
})

describe('saved meals', () => {
  const toast = food('toast', 200, 4)
  const salmon = food('salmon', 120, 0)
  const byId = { toast, salmon }

  it('builds a meal from a day’s entries and totals it', () => {
    const m = mealFromEntries('Usual breakfast', [entry(toast, 2, '1 slice'), entry(salmon, 56, 'g')], byId, 'breakfast')
    expect(m.items.map((i) => [i.foodId, i.amount, i.unit])).toEqual([['toast', 2, '1 slice'], ['salmon', 56, 'g']])
    const t = mealTotals(m.items, byId)
    expect(t.kcal).toBeCloseTo(200 + 67.2, 1) // 2 slices = 100 g toast + 56 g salmon
    expect(t.netCarbs).toBeCloseTo(4, 5)
  })

  it('skips entries whose food is gone, and falls back to the saved copy later', () => {
    const m = mealFromEntries('x', [entry(toast, 1, '1 slice'), { ...entry(salmon, 1, 'g'), food_id: 'missing' }], byId)
    expect(m.items).toHaveLength(1)
    expect(itemFood(m.items[0], {}).name).toBe('toast')
  })

  it('numbers default names that are taken', () => {
    expect(defaultMealName('breakfast', [])).toBe('Usual breakfast')
    expect(defaultMealName('breakfast', ['Usual breakfast'])).toBe('Usual breakfast 2')
  })
})
