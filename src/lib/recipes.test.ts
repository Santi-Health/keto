import { describe, expect, it } from 'vitest'
import type { NewFood } from './foods'
import { bestIngredientMatch, computeRecipe, parseIngredientLine, recipeToFood, resolveAmount } from './recipes'

const food = (overrides: Partial<NewFood> = {}): NewFood => ({
  name: 'Food',
  brand: null,
  barcode: null,
  per_100g: {},
  unit_conversions: [],
  ingredients_text: null,
  keto_notes: null,
  carbs_exclude_fiber: false,
  source: 'database',
  confidence: 'high',
  fields_estimated: [],
  meta: {},
  ...overrides,
})

describe('parseIngredientLine', () => {
  it('reads glued and spaced units', () => {
    expect(parseIngredientLine('200g chicken thigh')).toMatchObject({ amount: 200, unit: 'g', query: 'chicken thigh' })
    expect(parseIngredientLine('1.5 tbsp olive oil')).toMatchObject({ amount: 1.5, unit: 'tbsp', query: 'olive oil' })
  })
  it('reads fractions and mixed numbers', () => {
    expect(parseIngredientLine('½ avocado')).toMatchObject({ amount: 0.5, unit: null, query: 'avocado' })
    expect(parseIngredientLine('1 1/2 cups broccoli florets')).toMatchObject({ amount: 1.5, unit: 'cup', query: 'broccoli florets' })
  })
  it('converts pounds and kilos to grams and handles fl oz', () => {
    expect(parseIngredientLine('2 lb ground beef')!.amount).toBeCloseTo(907.2, 1)
    expect(parseIngredientLine('1 kg salmon')).toMatchObject({ amount: 1000, unit: 'g' })
    expect(parseIngredientLine('8 fl oz heavy cream')).toMatchObject({ amount: 8, unit: 'fl oz', query: 'heavy cream' })
  })
  it('treats counts and pieces as pieces, and drops notes', () => {
    expect(parseIngredientLine('3 eggs')).toMatchObject({ amount: 3, unit: null, query: 'eggs' })
    expect(parseIngredientLine('- 4 slices bacon, chopped')).toMatchObject({ amount: 4, unit: 'piece', query: 'bacon' })
    expect(parseIngredientLine('a pinch of salt')).toMatchObject({ amount: 1, query: 'pinch of salt' })
  })
  it('skips empty lines', () => {
    expect(parseIngredientLine('   ')).toBeNull()
  })
})

describe('resolveAmount', () => {
  it('uses the food’s own portion for counts', () => {
    const egg = food({ name: 'Egg, whole, raw', unit_conversions: [{ unit: '1 egg', grams: 50 }] })
    expect(resolveAmount(egg, { amount: 3, unit: null, query: 'eggs' })).toEqual({ amount: 3, unit: '1 egg', guessed: false })
  })
  it('falls back to typical piece weights and marks them as guesses', () => {
    expect(resolveAmount(food({ name: 'Avocados, raw' }), { amount: 0.5, unit: null, query: 'avocado' })).toEqual({
      amount: 68,
      unit: 'g',
      guessed: true,
    })
  })
  it('keeps standard units as given', () => {
    expect(resolveAmount(food(), { amount: 2, unit: 'tbsp', query: 'butter' })).toEqual({ amount: 2, unit: 'tbsp', guessed: false })
  })
})

describe('computeRecipe', () => {
  const eggs = food({ name: 'Egg', per_100g: { kcal: 143, protein: 12.6, fat: 9.5, netCarbs: 0.7 }, unit_conversions: [{ unit: '1 egg', grams: 50 }] })
  const butter = food({ name: 'Butter', per_100g: { kcal: 717, fat: 81, satFat: 51, netCarbs: 0 } })
  const tuna = food({ name: 'Albacore', per_100g: { kcal: 128, protein: 23.6 }, meta: { fishSpecies: 'tuna_albacore' } })

  it('totals ingredients and splits per serving', () => {
    const t = computeRecipe(
      [
        { food: eggs, foodId: null, amount: 4, unit: '1 egg' },
        { food: butter, foodId: null, amount: 20, unit: 'g' },
      ],
      2,
      null,
    )
    expect(t.rawGrams).toBe(220)
    expect(t.total.kcal).toBeCloseTo(286 + 143.4)
    expect(t.perServing.protein).toBeCloseTo(12.6)
    expect(t.servingGrams).toBe(110)
  })

  it('uses the cooked weight for per-100 g values', () => {
    const t = computeRecipe([{ food: butter, foodId: null, amount: 100, unit: 'g' }], 1, 50)
    expect(t.per100g.kcal).toBeCloseTo(1434)
    expect(t.servingGrams).toBe(50)
  })

  it('carries mercury from fish into the recipe', () => {
    const recipe = { servings: 2, cookedWeightG: null, ingredients: [{ food: tuna, foodId: null, amount: 142, unit: 'g' }] }
    const f = recipeToFood('Tuna salad', recipe)
    expect(f.source).toBe('recipe')
    expect(f.unit_conversions[0]).toEqual({ unit: '1 serving', grams: 71 })
    // 142 g × 0.35 ppm = 49.7 µg in the batch → 35 µg per 100 g
    expect(f.per_100g.mercuryUg).toBeCloseTo(35, 0)
  })
})

describe('bestIngredientMatch', () => {
  const pick = (q: string, names: string[]) => bestIngredientMatch(q, names.map((name) => ({ name })))?.name
  it('picks the plain raw food over parts, dishes and variants', () => {
    expect(pick('eggs', ['Egg, white, raw, fresh', 'Egg, yolk, raw, fresh', 'Egg, whole, raw, fresh', 'Egg substitute, powder'])).toBe(
      'Egg, whole, raw, fresh',
    )
    expect(pick('salmon', ['Lomi salmon', 'Fish, salmon, Atlantic, farmed, raw', 'Fish, salmon, pink, canned'])).toBe(
      'Fish, salmon, Atlantic, farmed, raw',
    )
    expect(pick('butter', ['Butter oil, anhydrous', 'Butter, salted', 'Butter, whipped, with salt'])).toBe('Butter, salted')
  })
  it('keeps words the line asked for', () => {
    expect(pick('olive oil', ['Olives, ripe, canned', 'Oil, olive, salad or cooking'])).toBe('Oil, olive, salad or cooking')
    expect(pick('egg whites', ['Egg, whole, raw, fresh', 'Egg, white, raw, fresh'])).toBe('Egg, white, raw, fresh')
  })
})
