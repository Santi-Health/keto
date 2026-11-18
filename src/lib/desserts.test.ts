import { describe, expect, it } from 'vitest'
import { STARTER_FOODS } from './starterFoods'
import { pairsFor, sectionsOf } from './quickFoods'
import type { Food } from './foods'

const food = (id: string, name: string, use_count = 1, brand: string | null = null) =>
  ({ id, name, brand, meta: {}, source: 'manual', use_count }) as unknown as Food

describe('keto desserts', () => {
  it('puts Oikos and Mantecol in Keto desserts, caramel sauce in condiments', () => {
    expect(sectionsOf(food('a', 'Oikos Triple Zero Vanilla'))).toContain('desserts')
    expect(sectionsOf(food('b', 'Keto Mantecol'))).toContain('desserts')
    expect(sectionsOf(food('c', 'Sugar Free Caramel Sauce'))).toEqual(['condiments'])
    expect(sectionsOf(food('d', 'Steak'))).not.toContain('desserts')
  })

  it('pairs Oikos with the caramel topping, not a caramel yogurt', () => {
    const oikos = food('o', 'Oikos Triple Zero Vanilla')
    const foods = [oikos, food('y', 'Oikos Salted Caramel', 9), food('c', 'Caramel Sauce', 2, 'ChocZero')]
    expect(pairsFor(oikos, foods).map((f) => f.id)).toEqual(['c'])
  })

  it('stores Mantecol per 100 g from the 435 g batch', () => {
    const m = STARTER_FOODS.find((f) => f.name === 'Keto Mantecol')!
    expect(m.per_100g.kcal).toBe(370)
    expect(m.per_100g.protein).toBeCloseTo(18.2, 1)
    expect(m.per_100g.fat).toBeCloseTo(28.7, 1)
    expect(m.per_100g.netCarbs).toBeCloseTo(6, 0)
    expect(m.meta.portion).toEqual({ amount: 50, unit: 'g' })
  })

  it('logs the lemon meringue pie by the slice with the approved numbers', () => {
    const pie = STARTER_FOODS.find((f) => f.name === 'Keto Lemon Meringue Pie')!
    const g = pie.unit_conversions.find((u) => u.unit === '1 slice')!.grams
    const slice = (k: keyof typeof pie.per_100g) => ((pie.per_100g[k] as number) * g) / 100
    expect(slice('kcal')).toBeCloseTo(285, 0)
    expect(slice('fat')).toBeCloseTo(26, 1)
    expect(slice('protein')).toBeCloseTo(7.4, 1)
    expect(slice('netCarbs')).toBeCloseTo(3.6, 1)
    expect(pie.meta.portion).toEqual({ amount: 1, unit: '1 slice' })
  })
})
