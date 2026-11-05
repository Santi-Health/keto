import { describe, expect, it } from 'vitest'
import { portionNutrients, suggestForMeal } from './foods'
import { servingOf } from './quickFoods'
import { STARTER_FOODS } from './starterFoods'
import { toGrams } from './units'

const guacamole = STARTER_FOODS[0]

describe('guacamole', () => {
  it('logs 4 oz by default with the approved numbers', () => {
    const { amount, unit } = servingOf(guacamole)
    expect({ amount, unit }).toEqual({ amount: 4, unit: 'oz' })
    const { grams } = toGrams({ unitConversions: guacamole.unit_conversions }, amount, unit)
    const n = portionNutrients(guacamole, grams)
    expect(n.kcal).toBeCloseTo(200, 0)
    expect(n.netCarbs).toBeCloseTo(4.1, 1)
    expect(n.fat).toBeCloseTo(17.9, 1)
    expect(n.fiber).toBeCloseTo(6.9, 1)
    expect(n.sodiumMg).toBeCloseTo(292, 0)
    expect(n.potassiumMg).toBeCloseTo(517, 0)
  })

  it('adds up to the approved whole recipe', () => {
    const batch = guacamole.unit_conversions[1]
    expect(batch.grams).toBeCloseTo(445, 0)
    const n = portionNutrients(guacamole, batch.grams)
    expect(n.kcal).toBeCloseTo(784, 0)
    expect(n.netCarbs).toBeCloseTo(16, 0)
  })

  it('shows as a dinner food, not at breakfast', () => {
    expect(suggestForMeal(STARTER_FOODS, [], 'dinner').map((f) => f.name)).toEqual(['Guacamole'])
    expect(suggestForMeal(STARTER_FOODS, [], 'breakfast')).toEqual([])
  })
})
