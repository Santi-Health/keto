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

describe('teas', () => {
  it('logs mate cocido and té con leche as 10 fl oz with 2 oz Fairlife, rooibos alone', () => {
    const mate = drinkByKey('mate_cocido')!
    expect(drinkPortion(mate)).toEqual({ amount: 10, unit: 'fl oz' })
    expect(mate.milk).toEqual({ key: 'fairlife_fat_free', oz: 2 })
    expect(drinkByKey('te_con_leche')!.milk?.oz).toBe(2)
    expect(drinkByKey('rooibos')!.milk).toBeUndefined()
    const f = drinkFood(drinkByKey('te_con_leche')!)
    const n = portionNutrients({ ...f, id: 't', favorite: false, use_count: 0, last_used_at: null, updated_at: '', deleted_at: null }, 10 * 29.6)
    expect(n.caffeineMg).toBeCloseTo(59, 0)
    expect(portionNutrients({ ...drinkFood(drinkByKey('rooibos')!), id: 'r', favorite: false, use_count: 0, last_used_at: null, updated_at: '', deleted_at: null }, 296).caffeineMg).toBe(0)
  })
})

describe('button order and Kazar', () => {
  it('starts with the everyday drinks, with Kazar where the single espresso was', () => {
    expect(DRINKS.slice(0, 5).map((d) => d.key)).toEqual(['water', 'coke_zero', 'espresso_double', 'mate_cocido', 'kazar'])
    expect(DRINKS.some((d) => d.key === 'espresso_single')).toBe(false)
    expect(drinkByKey('espresso_single')).toBeDefined() // still reachable from the Single/Double switch
  })

  it('logs Kazar as one pod and asks about milk', async () => {
    const { asksForMilk } = await import('./drinks')
    const k = drinkByKey('kazar')!
    expect(drinkPortion(k)).toEqual({ amount: 1, unit: 'pod' })
    expect(asksForMilk(k)).toBe(true)
    const n = portionNutrients({ ...drinkFood(k), id: 'k', favorite: false, use_count: 0, last_used_at: null, updated_at: '', deleted_at: null }, 40)
    expect(n.caffeineMg).toBeCloseTo(100, 0)
  })
})
