import { describe, expect, it } from 'vitest'
import { asPinch, brandsToShow, foodIcon, nutCountWords, oversizedSeasonings, sizeText, learnedPrefixes, nutCount, unshout, suggestDisplayName, sectionsOf, veryFrequentAt, pairsFor, portionText, saltKind, servingOf, shortName } from './quickFoods'

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
  it('keeps butter and cream cheese with the condiments, but not nut butters', () => {
    for (const n of ['Butter', 'Salted Butter', 'Sweet Cream Butter', 'Ghee', 'Philadelphia Cream Cheese', 'Philadelphia Original', 'Cheese, cream', 'Sour cream'])
      expect(sectionsOf(f(n))).toEqual(['condiments'])
    expect(sectionsOf(f('Almond butter'))).not.toContain('condiments')
    expect(sectionsOf(f('Peanut butter'))).not.toContain('condiments')
    expect(sectionsOf(f('Butter cookies'))).toEqual([])
  })
  it('keeps capers with the olives', () => {
    expect(sectionsOf(f('Capers'))).toEqual(sectionsOf(f('Olives')))
    expect(sectionsOf(f('Capers'))).toEqual(['fruits_nuts', 'picada'])
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
    for (const n of ['Cottage cheese', 'Ham steak', 'Grated parmesan', 'Cheese Bites Onion', 'Cheddar cheese crisps'])
      expect(sectionsOf(f(n))).toEqual([])
    for (const n of ['Cream cheese', 'Cheese, cream']) expect(sectionsOf(f(n))).not.toContain('picada')
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
  it('logs eggs and egg whites with NuSalt, salt, avocado oil and pepper', () => {
    expect(pairsFor(food('ew', 'Egg Whites'), pantry).map((f) => f.id)).toEqual(['nu', 'salt', 'oil', 'pep'])
    expect(pairsFor(food('e', 'Eggs, whole, raw'), pantry).map((f) => f.id)).toEqual(['nu', 'salt', 'oil', 'pep'])
  })
  it('finds salt and pepper even if they were moved out of Condiments', () => {
    const moved = pantry.map((f) => ({ ...f, meta: { ...f.meta, sections: [] } }))
    expect(pairsFor(food('e', 'Eggs'), moved).map((f) => f.id)).toEqual(['nu', 'salt', 'oil', 'pep'])
  })
  it('always gives eggs all four, and keeps anything else you added', () => {
    expect(pairsFor(food('e', 'Eggs', 0, { pairs: ['nu'] }), pantry).map((f) => f.id)).toEqual(['nu', 'salt', 'oil', 'pep'])
    expect(pairsFor(food('e', 'Eggs', 0, { pairs: [] }), pantry).map((f) => f.id)).toEqual(['nu', 'salt', 'oil', 'pep'])
    expect(pairsFor(food('e', 'Eggs', 0, { pairs: ['mayo'] }), pantry).map((f) => f.id)).toEqual(['nu', 'salt', 'oil', 'pep', 'mayo'])
  })
  it('keeps salt and pepper to a 1 g pinch, whatever was set by mistake', () => {
    const seasoning = (name: string, extra = {}) => ({ name, unit_conversions: [], meta: {}, ...extra })
    expect(servingOf(seasoning('Black pepper'))).toEqual({ amount: 1, unit: 'g' })
    expect(servingOf(seasoning('Salt, table'))).toEqual({ amount: 1, unit: 'g' })
    expect(servingOf(seasoning('Pepper', { meta: { portion: { amount: 100, unit: 'g' } } }))).toEqual({ amount: 1, unit: 'g' })
    expect(servingOf(seasoning('Pepper', { meta: { portion: { amount: 2, unit: 'g' } } }))).toEqual({ amount: 2, unit: 'g' })
    expect(servingOf(seasoning('Nu-Salt', { unit_conversions: [{ unit: '1 serving', grams: 1 }] }))).toEqual({ amount: 1, unit: 'g' })
  })
  it('finds salt and pepper logged by mistake, and shrinks them to a pinch', () => {
    const entry = (food_name: string, grams: number, food_id: string | null = null) => ({ food_id, food_name, grams, amount: grams, unit: 'g', nutrients: { kcal: 251, netCarbs: 39, sweetenerServings: 1 } })
    const logs = [entry('Black pepper', 100), entry('Black pepper', 1), entry('Salt, table', 5), entry('Red pepper', 100), entry('Salt and pepper mix', 100, 'r')]
    expect(oversizedSeasonings(logs, { r: { source: 'recipe' } })).toEqual([logs[0]])
    const pinch = asPinch(logs[0])
    expect(pinch).toMatchObject({ amount: 1, unit: 'g', grams: 1 })
    expect(pinch.nutrients.kcal).toBeCloseTo(2.51)
    expect(pinch.nutrients.netCarbs).toBeCloseTo(0.39)
    expect(pinch.nutrients.sweetenerServings).toBe(1)
  })
  it('says how much every portion is', () => {
    expect(sizeText(1, '1 serving', 85)).toBe('1 serv. (85 g)')
    expect(sizeText(3, 'oz', 85)).toBe('3 oz (85 g)')
    expect(sizeText(150, 'g', 150)).toBe('150 g (5.3 oz)')
    expect(sizeText(1, 'g', 1)).toBe('1 g')
    expect(sizeText(2, '1 egg', 100)).toBe('2 eggs (100 g)')
    expect(sizeText(1, '1 serving (3 slices (56 g))', 56)).toBe('1 serv. (3 slices, 56 g)')
    expect(sizeText(1, '1 serving (1 portion (0.5 g))', 0.5)).toBe('1 portion (0.5 g)')
    expect(sizeText(10, 'fl oz', 296)).toBe('10 fl oz')
    expect(sizeText(1, 'can', 355)).toBe('1 can')
  })
  it('counts nuts in words', () => {
    expect(nutCountWords({ name: 'Almonds' }, 28.35)).toBe('~23 almonds')
    expect(nutCountWords({ name: 'Eggs' }, 28.35)).toBeNull()
  })
  it('does not treat vegetables or dishes as seasoning', () => {
    for (const n of ['Red pepper', 'Red bell pepper', 'Pepper jack cheese', 'Salt and pepper chicken']) expect(servingOf({ name: n, unit_conversions: [], meta: {} })).toEqual({ amount: 100, unit: 'g' })
  })
  it('salts anything you cook, but not cured meats or recipes', () => {
    for (const n of ['Outside Skirt', 'Chicken thighs', 'Salmon fillet', 'Broccoli', 'Eggplant']) expect(pairsFor(food('x', n), pantry).map((f) => f.id)).toEqual(['nu', 'salt'])
    for (const n of ['Canadian Bacon', 'Johnsonville Brats', 'Smoked salmon', 'Avocado']) expect(pairsFor(food('x', n), pantry)).toEqual([])
    expect(pairsFor({ ...food('x', 'Chicken curry'), source: 'recipe' as const }, pantry)).toEqual([])
    expect([saltKind({ name: 'NuSalt' }), saltKind({ name: 'Salt, table' }), saltKind({ name: 'Black pepper' })]).toEqual(['nusalt', 'salt', null])
  })
  it('follows the pairings you chose, even none', () => {
    expect(pairsFor(food('c', 'Chicken thighs', 0, { pairs: ['salt'] }), pantry).map((f) => f.id)).toEqual(['salt'])
    expect(pairsFor(food('c', 'Chicken thighs', 0, { pairs: [] }), pantry)).toEqual([])
  })
})
