import { describe, expect, it } from 'vitest'
import { brandsToShow, foodIcon, learnedPrefixes, nutCount, unshout, suggestDisplayName, sectionsOf, veryFrequentAt, pairsFor, portionText, saltKind, servingOf, shortName } from './quickFoods'

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
    expect(sectionsOf(f('Blueberries'))).toEqual(['fruits_nuts'])
    expect(sectionsOf(f('Nuts, macadamia nuts, raw'))).toEqual(['fruits_nuts'])
    expect(sectionsOf(f('Olives, ripe, canned'))).toEqual(['fruits_nuts', 'picada'])
    expect(sectionsOf(f('Kalamata olives', 'Mezzetta'))).toEqual(['fruits_nuts', 'picada'])
    expect(sectionsOf(f('Extra virgin olive oil'))).toEqual(['condiments'])
    expect(sectionsOf(f('Avocado oil'))).toEqual(['condiments'])
    expect(sectionsOf(f('Tuna in olive oil'))).toEqual([])
    expect(sectionsOf(f('Almond flour'))).toEqual([])
    expect(sectionsOf(f('Unsweetened almond milk'))).toEqual([])
    expect(sectionsOf(f('Avocado'))).toEqual([])
    expect(sectionsOf(f('Avocado', null, { group: 'fruits_nuts' }))).toEqual(['fruits_nuts'])
    expect(sectionsOf(f('Pecans', null, { group: 'other' }))).toEqual([])
  })
  it('finds condiments, leaving out peppers you eat as a vegetable', () => {
    for (const n of ['Mayonnaise', 'Avocado oil mayo', 'Ketchup, no sugar added', 'Dijon mustard', 'Sriracha', 'Ranch dressing', 'Basil pesto', 'Coconut aminos', 'Black pepper', 'NuSalt', 'Everything bagel seasoning'])
      expect(sectionsOf(f(n))).toEqual(['condiments'])
    expect(sectionsOf(f('Red bell pepper'))).toEqual([])
    expect(sectionsOf(f('Salt and pepper chicken'))).toEqual([])
    expect(sectionsOf(f('Pecans', null, { group: 'condiments' }))).toEqual(['condiments'])
  })
  it('picks an icon and reads portions', () => {
    expect(foodIcon(f('Keto bread'))).toBe('🍞')
    expect(foodIcon(f('Avocado oil mayo'))).toBe('🫙')
    expect(foodIcon(f('Black pepper'))).toBe('🧂')
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
  it('puts cheese and cold meats in Picada, not cream cheese or ham steaks', () => {
    for (const n of ['Manchego cheese', 'Brie', 'Genoa salami', 'Prosciutto di Parma', 'Jamón serrano', 'Sliced ham', 'Chorizo', 'Cheddar cheese, sharp'])
      expect(sectionsOf(f(n))).toEqual(['picada'])
    for (const n of ['Cream cheese', 'Cheese, cream', 'Cottage cheese', 'Ham steak', 'Grated parmesan', 'Cheese Bites Onion', 'Cheddar cheese crisps'])
      expect(sectionsOf(f(n))).toEqual([])
    expect(sectionsOf(f('Olives', null, { sections: ['picada'] }))).toEqual(['picada'])
    expect(sectionsOf(f('Olives', null, { group: 'other' }))).toEqual([])
  })
  it('shows a section food with a meal only when it is eaten there very often', () => {
    const now = Date.parse('2026-11-01T12:00:00')
    const at = (daysAgo: number, meal = 'breakfast') => ({ food_id: 'cheese', meal, eaten_at: new Date(now - daysAgo * 86_400_000).toISOString() })
    expect(veryFrequentAt('cheese', 'breakfast', [at(1), at(2), at(3)], now)).toBe(false)
    expect(veryFrequentAt('cheese', 'breakfast', [at(1), at(2), at(3), at(5)], now)).toBe(true)
    expect(veryFrequentAt('cheese', 'breakfast', [at(1), at(1), at(1), at(1)], now)).toBe(false)
    expect(veryFrequentAt('cheese', 'breakfast', [at(1), at(2), at(3), at(40)], now)).toBe(false)
    expect(veryFrequentAt('cheese', 'lunch', [at(1), at(2), at(3), at(5)], now)).toBe(false)
  })
  it('uses the names you chose for specific foods, and calms ALL CAPS', () => {
    const cases: [string, string | null, string][] = [
      ['Light Mayonnaise', 'Best Foods', 'BF Light Mayo'],
      ['Tomato Ketchup', 'Heinz', 'Heinz Ketchup'],
      ['NuSalt Salt Substitute', null, 'NuSalt'],
      ['Salt', null, 'Salt'],
      ['CANADIAN BACON', null, 'Canadian Bacon'],
      ['High Protein Sushi Roll (salmon)', null, 'Protein Sushi Roll'],
      ['Original Brats', 'Johnsonville', 'Johnsonville Brats Original'],
      ['Beef, plate, outside skirt steak, separable lean and fat, trimmed to 0" fat, all grades, raw', null, 'Outside Skirt'],
      ['Keto Soft White Bread', "Nature's Own", 'Nat Own Keto Bread'],
      ['Egg Whites', 'Kirkland Signature', 'Kirk Egg Whites'],
      ['Egg Whites', 'Egg Beaters', 'Egg Whites'],
      ['SHARP CHEDDAR', null, 'Sharp Cheddar'],
    ]
    for (const [name, brand, want] of cases) expect(shortName(f(name, brand))).toBe(want)
  })
  it('counts whole nuts in a portion', () => {
    expect(nutCount(f('Almonds'), 28.35)).toBe('~23')
    expect(nutCount(f('Pistachios, dry roasted'), 28.35)).toBe('~49')
    expect(nutCount(f('Almonds'), 14.2)).toBe('~12')
    expect(nutCount(f('Almond butter'), 32)).toBe(null)
    expect(nutCount(f('Kalamata olives', 'Mezzetta'), 15)).toBe('~3')
    expect(nutCount(f('Olive tapenade'), 15)).toBe(null)
    expect(nutCount(f('Extra virgin olive oil'), 14)).toBe(null)
    expect(nutCount(f('Blueberries'), 74)).toBe(null)
  })
  it('suggests display names with the brand short forms you use, learning new ones from your renames', () => {
    const prefixes = learnedPrefixes([f('Baby Spinach', 'Trader Joe\'s', { buttonName: 'TJ Baby Spinach' }), f('Avocados', null, { buttonName: 'Avocados' })])
    expect(suggestDisplayName(f('Organic Almond Butter', 'Kirkland Signature'), prefixes)).toBe('Kirk Organic Almond Butter')
    expect(suggestDisplayName(f('Unsalted Butter', "Trader Joe's"), prefixes)).toBe('TJ Unsalted Butter')
    expect(suggestDisplayName(f('Light Mayonnaise', 'Best Foods'), prefixes)).toBe('BF Light Mayo')
    expect(suggestDisplayName(f('Smoked salmon'), prefixes)).toBe('Smoked salmon')
    expect(suggestDisplayName(f('Heinz Tomato Ketchup', 'Heinz'), prefixes)).toBe('Heinz Ketchup')
  })
  it('treats Oikos and other yogurts as yogurt, not fruit, whatever the flavor', () => {
    expect(foodIcon(f('Oikos Triple Zero Banana Cream', 'Dannon'))).toBe('🥣')
    expect(shortName(f('Oikos Triple Zero Banana Cream', 'Dannon'))).toBe('Oikos Banana Cream')
    expect(shortName(f('Oikos Triple Zero Strawberry Greek Yogurt', 'Dannon'))).toBe('Oikos Strawberry')
    expect(foodIcon(f('Banana yogurt'))).toBe('🥣')
    expect(foodIcon(f('Banana'))).toBe('🍌')
    expect(sectionsOf(f('Oikos Triple Zero Banana Cream', 'Dannon'))).toEqual([])
    expect(sectionsOf(f('Strawberry Greek yogurt'))).toEqual([])
  })
  it('keeps servings short: the count, without the weight', () => {
    expect(portionText(1, '1 serving (3 slices (56 g))')).toBe('1 serv. (3 slices)')
    expect(portionText(1, '1 serving (3 slices, 56 g)')).toBe('1 serv. (3 slices)')
    expect(portionText(1, '1 serving (3 slices)')).toBe('1 serv. (3 slices)')
    expect(portionText(2, '1 serving (3 slices (56 g))')).toBe('6 slices')
    expect(portionText(1.5, '1 serving (3 slices)')).toBe('4½ slices')
    expect(portionText(2, '1 serving (2 tbsp (30 ml))')).toBe('4 tbsp')
    expect(portionText(1, '1 serving (56 g)')).toBe('1 serv.')
  })
  it('shortens serving and container, counts already given, and calms capitals', () => {
    expect(portionText(1, '1 container')).toBe('1 cont.')
    expect(portionText(2, '1 container (150 g)')).toBe('2 cont.')
    expect(portionText(1, '1 slice')).toBe('1 slice')
    expect(portionText(2, 'shot')).toBe('2 shots')
    expect(portionText(1, 'can')).toBe('1 can')
    expect(nutCount(f('Green olives'), 15, '5 olives')).toBe(null)
    expect(unshout('CANADIAN BACON')).toBe('Canadian Bacon')
    expect(unshout('Keto Bread (SOLA)')).toBe('Keto Bread (Sola)')
    expect(unshout('BF Light Mayo')).toBe('BF Light Mayo')
    expect(unshout('MCT oil')).toBe('MCT oil')
  })
})

describe('foods that go with another', () => {
  const food = (id: string, name: string, use_count = 0, meta = {}) => ({ id, name, brand: null, meta, source: 'manual' as const, use_count })
  const pantry = [
    food('oil', 'Avocado oil', 5),
    food('mayo', 'Avocado oil mayo', 9),
    food('salt', 'Salt, table', 8),
    food('nu', 'NuSalt', 3),
    food('pep', 'Black pepper', 4),
    food('chk', 'Salt and pepper chicken', 20),
  ]
  it('logs egg whites with avocado oil, salt, pepper and NuSalt, and eggs with salt and pepper', () => {
    expect(pairsFor(food('ew', 'Egg Whites'), pantry).map((f) => f.id)).toEqual(['oil', 'salt', 'pep', 'nu'])
    expect(pairsFor(food('e', 'Eggs, whole, raw'), pantry).map((f) => f.id)).toEqual(['salt', 'pep', 'nu'])
  })
  it('salts anything you cook, but not cured meats or recipes', () => {
    for (const n of ['Outside Skirt', 'Chicken thighs', 'Salmon fillet', 'Broccoli', 'Eggplant']) expect(pairsFor(food('x', n), pantry).map((f) => f.id)).toEqual(['salt', 'nu'])
    for (const n of ['Canadian Bacon', 'Johnsonville Brats', 'Smoked salmon', 'Avocado']) expect(pairsFor(food('x', n), pantry)).toEqual([])
    expect(pairsFor({ ...food('x', 'Chicken curry'), source: 'recipe' as const }, pantry)).toEqual([])
    expect([saltKind({ name: 'NuSalt' }), saltKind({ name: 'Salt, table' }), saltKind({ name: 'Black pepper' })]).toEqual(['nusalt', 'salt', null])
  })
  it('follows the pairings you chose, even none', () => {
    expect(pairsFor(food('ew', 'Egg Whites', 0, { pairs: ['salt'] }), pantry).map((f) => f.id)).toEqual(['salt'])
    expect(pairsFor(food('ew', 'Egg Whites', 0, { pairs: [] }), pantry)).toEqual([])
  })
})
