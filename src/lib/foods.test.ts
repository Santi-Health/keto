import { describe, expect, it } from 'vitest'
import { buildLogEntry, completeNutrients, type Food } from './foods'
import { toGrams } from './units'

const food = (overrides: Partial<Food> = {}): Food => ({
  id: 'f1',
  name: 'Food',
  brand: null,
  barcode: null,
  per_100g: { kcal: 100, protein: 10, carbs: 5, fiber: 2, netCarbs: 3 },
  unit_conversions: [],
  ingredients_text: null,
  keto_notes: null,
  carbs_exclude_fiber: false,
  source: 'manual',
  confidence: 'high',
  fields_estimated: [],
  favorite: false,
  use_count: 0,
  last_used_at: null,
  meta: {},
  updated_at: '',
  deleted_at: null,
  ...overrides,
})

describe('toGrams', () => {
  it('uses food portions, then standard units', () => {
    const egg = { unitConversions: [{ unit: '1 egg', grams: 50 }] }
    expect(toGrams(egg, 2, '1 egg').grams).toBe(100)
    expect(toGrams(egg, 1, 'oz').grams).toBeCloseTo(28.35)
  })
  it('marks volume as approximate unless the food has a cup measure', () => {
    expect(toGrams({ unitConversions: [] }, 1, 'tbsp')).toEqual({ grams: 14.7868, approximate: true })
    const oil = toGrams({ unitConversions: [{ unit: '1 cup', grams: 216 }] }, 1, 'tbsp')
    expect(oil.approximate).toBe(false)
    expect(oil.grams).toBeCloseTo(13.5, 1)
  })
})

describe('completeNutrients', () => {
  it('computes net carbs and fills calories from macros', () => {
    const n = completeNutrients({ protein: 10, fat: 10, carbs: 8, fiber: 5, sugarAlcohols: 2 }, false, 'erythritol')
    expect(n.netCarbs).toBe(1)
    expect(n.kcal).toBe(10 * 4 + 8 * 4 + 10 * 9)
  })
})

describe('buildLogEntry', () => {
  it('scales nutrients to the portion', () => {
    const e = buildLogEntry(food(), 150, 'g', 'lunch', new Date('2026-10-30T12:00:00Z'))
    expect(e.nutrients.protein).toBe(15)
    expect(e.nutrients.netCarbs).toBe(4.5)
  })

  it('adds mercury for fish and grams for processed meat', () => {
    const tuna = buildLogEntry(food({ meta: { fishSpecies: 'tuna_albacore' } }), 142, 'g', 'lunch', new Date())
    expect(tuna.nutrients.mercuryUg).toBeCloseTo(49.7, 1)
    const bacon = buildLogEntry(food({ meta: { processedMeat: true, sweeteners: ['sucralose'] } }), 30, 'g', 'breakfast', new Date())
    expect(bacon.nutrients.processedMeatG).toBe(30)
    expect(bacon.nutrients.sweetenerServings).toBe(1)
  })
})
