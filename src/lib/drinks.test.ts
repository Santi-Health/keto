import { describe, expect, it } from 'vitest'
import { DRINKS, MILKS, drinkByKey, drinkFood, drinkPortion, milkFood } from './drinks'
import { portionNutrients, type Food } from './foods'

const asFood = (f: ReturnType<typeof drinkFood>): Food => ({ ...f, id: 'x', favorite: false, use_count: 0, last_used_at: null, updated_at: '', deleted_at: null })

describe('drinks', () => {
  it('logs a Diet Coke can with its caffeine, sodium and a sweetener serving', () => {
    const n = portionNutrients(asFood(drinkFood(drinkByKey('diet_coke')!)), 355)
    expect(n.caffeineMg).toBeCloseTo(46, 1)
    expect(n.sodiumMg).toBeCloseTo(40, 1)
    expect(n.netCarbs).toBe(0)
    expect(n.sweetenerServings).toBe(1)
  })

  it('makes a double espresso two shots of the same food', () => {
    const single = drinkFood(drinkByKey('espresso_single')!)
    const double = drinkFood(drinkByKey('espresso_double')!)
    expect(single.meta.externalId).toBe(double.meta.externalId)
    expect(drinkPortion(drinkByKey('espresso_double')!)).toEqual({ amount: 2, unit: 'shot' })
    expect(portionNutrients(asFood(double), 60).caffeineMg).toBeCloseTo(128, 0)
  })

  it('only water counts toward hydration', () => {
    expect(DRINKS.filter((d) => d.hydration).map((d) => d.key)).toEqual(['water', 'sparkling_water'])
  })
})

describe('milk in espresso', () => {
  it('logs 4 fl oz of Fairlife fat-free as about 40 kcal and 6.5 g protein', () => {
    const f = { ...milkFood(MILKS.find((m) => m.key === 'fairlife_fat_free')!), id: 'm', favorite: false, use_count: 0, last_used_at: null, updated_at: '', deleted_at: null }
    const n = portionNutrients(f, 4 * 30.5)
    expect(n.kcal).toBeCloseTo(40, 0)
    expect(n.protein).toBeCloseTo(6.5, 1)
    expect(n.netCarbs).toBeCloseTo(3, 0)
  })
})
