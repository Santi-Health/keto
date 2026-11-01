import { describe, expect, it } from 'vitest'
import { brandsToShow, foodIcon, isFruitOrNut, portionText, servingOf, shortName } from './quickFoods'

const f = (name: string, brand: string | null = null, meta = {}, id = name) => ({ id, name, brand, meta, source: 'manual' as const })

describe('food buttons', () => {
  it('shortens names to a couple of words', () => {
    expect(shortName(f('Sola Sweet & Buttery Keto Bread', 'Sola'))).toBe('Keto Bread')
    expect(shortName(f('Nuts, macadamia nuts, raw'))).toBe('Macadamia nuts')
    expect(shortName(f('Cheese, cream'))).toBe('Cream cheese')
    expect(shortName(f('Eggs, whole, raw'))).toBe('Eggs')
    expect(shortName(f('Smoked salmon'))).toBe('Smoked salmon')
    expect(shortName(f('Greek yogurt plain whole milk', 'Fage'))).toBe('Greek yogurt')
    expect(shortName(f('Keto bread', null, { buttonName: 'My bread' }))).toBe('My bread')
  })
  it('shows the brand only when two buttons read the same', () => {
    const b = brandsToShow([f('Keto bread', 'Sola', {}, 'a'), f('Keto Bread', 'Base Culture', {}, 'b'), f('Eggs', 'Vital Farms', {}, 'c')])
    expect(b).toEqual({ a: 'Sola', b: 'Base Culture' })
  })
  it('finds fruits and nuts, leaving out flours and milks, and follows your choice', () => {
    expect(isFruitOrNut(f('Blueberries'))).toBe(true)
    expect(isFruitOrNut(f('Nuts, macadamia nuts, raw'))).toBe(true)
    expect(isFruitOrNut(f('Almond flour'))).toBe(false)
    expect(isFruitOrNut(f('Unsweetened almond milk'))).toBe(false)
    expect(isFruitOrNut(f('Avocado'))).toBe(false)
    expect(isFruitOrNut(f('Avocado', null, { group: 'fruits_nuts' }))).toBe(true)
    expect(isFruitOrNut(f('Pecans', null, { group: 'other' }))).toBe(false)
  })
  it('picks an icon and reads portions', () => {
    expect(foodIcon(f('Keto bread'))).toBe('🍞')
    expect(foodIcon(f('Sola Sweet & Buttery Keto Bread', 'Sola'))).toBe('🍞')
    expect(foodIcon(f('Large eggs'))).toBe('🥚')
    expect(servingOf({ unit_conversions: [{ unit: '1 slice', grams: 30 }] })).toEqual({ amount: 1, unit: '1 slice' })
    expect(servingOf({ unit_conversions: [] })).toEqual({ amount: 100, unit: 'g' })
    expect(portionText(2, '1 egg')).toBe('2 eggs')
    expect(portionText(0.5, '1 slice')).toBe('½ slice')
    expect(portionText(1.5, '1 serving (1 bar (40 g))')).toBe('1½ bars')
    expect(portionText(150, 'g')).toBe('150 g')
    expect(portionText(1, '½ fruit')).toBe('½ fruit')
    expect(portionText(2, '2 oz')).toBe('2 × 2 oz')
  })
})
