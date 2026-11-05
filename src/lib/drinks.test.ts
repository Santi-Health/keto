import { describe, expect, it } from 'vitest'
import { DRINKS, MILKS, drinkByKey, drinkFood, drinkPortion, hydration, milkFood, glasses, liters, ML_PER_OZ } from './drinks'
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

  it('logs a Spindrift can as a food, so its carbs count, right after Sparkling Rain', () => {
    const d = drinkByKey('spindrift')!
    expect(DRINKS[DRINKS.indexOf(d) - 1].key).toBe('sparkling_rain')
    expect(drinkPortion(d)).toEqual({ amount: 1, unit: 'can' })
    const n = portionNutrients(asFood(drinkFood(d)), 355)
    expect(n.kcal).toBeCloseTo(3, 1)
    expect(n.netCarbs).toBeCloseTo(1, 1)
  })

  it('only water counts toward hydration', () => {
    expect(DRINKS.filter((d) => d.hydration).map((d) => d.key)).toEqual(['water', 'sparkling_water', 'sparkling_rain'])
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
  it('matches the fairlife chocolate label for a whole 340 ml bottle', () => {
    const f = { ...milkFood(MILKS.find((m) => m.key === 'fairlife_chocolate')!), id: 'c', favorite: false, use_count: 0, last_used_at: null, updated_at: '', deleted_at: null }
    const n = portionNutrients(f, (340 / ML_PER_OZ) * 30.5)
    expect(Math.round(n.kcal!)).toBe(150)
    expect(Math.round(n.protein!)).toBe(30)
    expect(Math.round(n.netCarbs!)).toBe(3)
    expect(Math.round(n.sodiumMg!)).toBe(230)
    expect(f.meta.sweeteners).toContain('sucralose')
  })
  it('logs the Fairlife chocolate button as one bottle with the label numbers, last in the row', () => {
    const d = drinkByKey('fairlife_choc_bottle')!
    expect(DRINKS[DRINKS.length - 1].key).toBe('fairlife_choc_bottle')
    expect(drinkPortion(d)).toEqual({ amount: 1, unit: 'bottle' })
    const food = asFood(drinkFood(d))
    const n = portionNutrients(food, food.unit_conversions[0].grams)
    expect(Math.round(n.kcal!)).toBe(150)
    expect(Math.round(n.protein!)).toBe(30)
    expect(Math.round(n.calciumMg!)).toBe(730)
    expect(food.keto_notes).toMatch(/^No added sugar/)
  })
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

describe('button order and Nespresso pods', () => {
  it('starts with the morning mate cocido, then the everyday drinks, with the pods right after espresso', () => {
    expect(DRINKS.slice(0, 7).map((d) => d.key)).toEqual(['mate_cocido', 'water', 'coke_zero', 'espresso_double', 'kazar', 'volluto_decaf', 'ba_lungo'])
    expect(DRINKS.some((d) => d.key === 'espresso_single')).toBe(false)
    expect(drinkByKey('espresso_single')).toBeDefined() // still reachable from the Single/Double switch
  })

  it('logs Kazaar as one pod and asks about milk', async () => {
    const { asksForMilk } = await import('./drinks')
    const k = drinkByKey('kazar')!
    expect(drinkPortion(k)).toEqual({ amount: 1, unit: 'pod' })
    expect(asksForMilk(k)).toBe(true)
    const n = portionNutrients({ ...drinkFood(k), id: 'k', favorite: false, use_count: 0, last_used_at: null, updated_at: '', deleted_at: null }, 40)
    expect(n.caffeineMg).toBeCloseTo(120, 0)
  })

  it('logs Decaf Ristretto and BA Lungo as one pod each, asking about milk', async () => {
    const { asksForMilk } = await import('./drinks')
    for (const [key, ml, caffeine] of [['volluto_decaf', 25, 3], ['ba_lungo', 110, 85]] as const) {
      const d = drinkByKey(key)!
      expect(drinkPortion(d)).toEqual({ amount: 1, unit: 'pod' })
      expect(asksForMilk(d)).toBe(true)
      const food = asFood(drinkFood(d))
      expect(food.unit_conversions[0].grams).toBe(ml)
      expect(portionNutrients(food, ml).caffeineMg).toBeCloseTo(caffeine, 0)
    }
  })
})

describe('hydration', () => {
  it('counts every drink by volume, with no caffeine penalty up to 400 mg', () => {
    // 4 cups water + a 12 oz can of Coke Zero (34 mg caffeine) + a double espresso (128 mg).
    const h = hydration(32, [{ grams: 355, caffeineMg: 34 }, { grams: 60, caffeineMg: 128 }])
    expect(h.drinksOz).toBeCloseTo(14, 0)
    expect(h.caffeineLossOz).toBe(0)
    expect(h.totalOz).toBeCloseTo(46, 0)
  })

  it('takes a little off for caffeine above 400 mg', () => {
    // 600 mg: 200 mg over × 0.36 mL ≈ 72 mL ≈ 2.4 oz.
    const h = hydration(0, [{ grams: 296, caffeineMg: 600 }])
    expect(h.caffeineLossOz).toBeCloseTo(2.4, 1)
    expect(h.totalOz).toBeCloseTo(10 - 2.4, 1)
  })
})

describe('drinks tracker glasses', () => {
  it('fills 1½ glasses for a 355 ml can and draws enough empty ones for the goal', () => {
    expect(glasses(12, 2000 / ML_PER_OZ)).toEqual([1, 0.5, 0, 0, 0, 0, 0, 0])
  })
  it('adds glasses past the goal', () => {
    expect(glasses((750 / ML_PER_OZ), 500 / ML_PER_OZ)).toEqual([1, 1, 1])
  })
  it('shows liters, or ml under half a liter', () => {
    expect(liters(12)).toBe('350 ml')
    expect(liters(2000 / ML_PER_OZ)).toBe('2 L')
    expect(liters(1440 / ML_PER_OZ)).toBe('1.4 L')
  })
})
