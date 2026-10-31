import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildLogEntry, type Food } from './foods'
import { mapUsdaFood } from './foodApi'
import { MICROS, microStatus, vitaminCoverage } from './micros'
import { fillFood, fillLog, plainName } from './vitaminFill'

afterEach(() => vi.unstubAllGlobals())

const food = (over: Partial<Food>): Food => ({
  id: 'f', name: 'Kirkland Signature Egg Whites', brand: 'Kirkland Signature', barcode: null, per_100g: { kcal: 54, protein: 10.9, calciumMg: 7 },
  unit_conversions: [{ unit: '3 tbsp', grams: 46 }], ingredients_text: null, keto_notes: null, carbs_exclude_fiber: false, source: 'manual',
  confidence: 'high', fields_estimated: [], favorite: true, use_count: 1, last_used_at: null, meta: {}, updated_at: '', deleted_at: null, ...over,
})

describe('vitamin targets', () => {
  it('uses the adult male RDAs', () => {
    const t = Object.fromEntries(MICROS.map((m) => [m.key, m.target('male', 42)]))
    expect(t).toMatchObject({ vitDUg: 15, vitCMg: 90, b12Ug: 2.4, folateUg: 400, zincMg: 11, cholineMg: 550, ironMg: 8, calciumMg: 1000 })
  })

  it('lists the lowest first and flags going over an upper limit', () => {
    const s = microStatus({ vitCMg: 90, vitDUg: 3, zincMg: 45 }, 'male', 42)
    expect(s[0].pct).toBe(0)
    expect(s.find((x) => x.micro.key === 'zincMg')!.over).toBe(true)
    expect(s.find((x) => x.micro.key === 'vitCMg')!.pct).toBe(100)
  })

  it('knows how much of the day has vitamin data', () => {
    expect(vitaminCoverage([{ kcal: 300, vitCMg: 1 }, { kcal: 100 }])).toBe(75)
  })
})

describe('reading vitamins from USDA', () => {
  it('maps USDA nutrient numbers', () => {
    const f = mapUsdaFood({
      fdcId: 1, description: 'EGG, WHITE, RAW', dataType: 'SR Legacy',
      foodNutrients: [{ nutrientNumber: '401', value: 0 }, { nutrientNumber: '418', value: 0.09 }, { nutrientNumber: '317', value: 20 }, { nutrientNumber: '421', value: 1.1 }],
    })
    expect(f.per_100g).toMatchObject({ vitCMg: 0, b12Ug: 0.09, seleniumUg: 20, cholineMg: 1.1 })
  })
})

describe('filling in vitamins for saved foods', () => {
  it('cleans brand words for matching', () => {
    expect(plainName({ name: 'Kirkland Signature Egg Whites', brand: 'Kirkland Signature' })).toBe('egg whites')
    expect(plainName({ name: 'CANADIAN BACON', brand: 'JONES' })).toBe('canadian bacon')
  })

  it('borrows vitamins from the closest plain USDA food, keeping label values and marking them estimated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      foods: [{ fdcId: 9, description: 'Egg, white, raw, fresh', dataType: 'SR Legacy', foodNutrients: [{ nutrientNumber: '317', value: 20 }, { nutrientNumber: '418', value: 0.09 }, { nutrientNumber: '301', value: 999 }] }],
    }))))
    const f = await fillFood(food({}))
    expect(f.per_100g).toMatchObject({ seleniumUg: 20, b12Ug: 0.09, calciumMg: 7 }) // the label's calcium stays
    expect(f.fields_estimated).toContain('vitamins')
    expect(f.meta).toMatchObject({ vitaminsChecked: true, vitaminsFrom: 'Egg, white, raw, fresh' })
  })

  it('adds the vitamins to a logged portion without touching other values', () => {
    const before = food({})
    const log = { ...buildLogEntry(before, 2, '3 tbsp', 'breakfast', new Date()), id: 'l', updated_at: '', deleted_at: null }
    const after = food({ per_100g: { ...before.per_100g, seleniumUg: 20, b12Ug: 0.09 } })
    const filled = fillLog(log, after)!
    expect(filled.nutrients.seleniumUg).toBeCloseTo(18.4, 5) // 92 g
    expect(filled.nutrients.kcal).toBe(log.nutrients.kcal)
    expect(fillLog(filled, after)).toBeNull()
  })
})

describe('made products', () => {
  it('does not borrow vitamins for shakes, bars or breads; they keep their label', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const f = await fillFood(food({ name: 'fairlife Nutrition Plan Shake', brand: 'fairlife' }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(f.meta.vitaminsChecked).toBe(true)
    expect(f.meta.vitaminsFrom).toBeUndefined()
    expect(plainName({ name: 'Fairlife Nonfat Ultra-Filtered Milk', brand: 'Fairlife' })).toBe('milk nonfat fluid')
  })
})
