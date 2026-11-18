import { completeNutrients, type Food, type NewFood } from './foods'
import type { Nutrients } from './nutrients'
import { isCookingOil, isPepper, isPlainSalt } from './quickFoods'
import { recipeToFood, type RecipeIngredient } from './recipes'

/**
 * Recipes the app adds to My Foods once. Each has a fixed id, so every device adds the same row,
 * and one you edited or deleted is left as it is.
 */

const ingredient = (name: string, per100g: Nutrients, amount: number, unit: string, grams?: number): RecipeIngredient => ({
  food: {
    name,
    brand: null,
    barcode: null,
    per_100g: completeNutrients(per100g, false),
    unit_conversions: grams ? [{ unit, grams }] : [],
    ingredients_text: null,
    keto_notes: null,
    carbs_exclude_fiber: false,
    source: 'manual',
    confidence: 'medium',
    fields_estimated: [],
    meta: {},
  } satisfies NewFood,
  foodId: null,
  amount,
  unit,
})

const asStarter = (id: string, food: NewFood): Food => ({ ...food, id, favorite: false, use_count: 0, last_used_at: null, updated_at: '', deleted_at: null })

const guacamole = recipeToFood('Guacamole', {
  // The batch weighs 445 g, so about 3.92 servings of 4 oz.
  servings: 3.92,
  cookedWeightG: null,
  ingredients: [
    // USDA California (Hass) avocado, flesh only.
    ingredient('Avocado', { kcal: 167, protein: 1.96, fat: 15.4, satFat: 2.13, carbs: 8.64, fiber: 6.8, sugars: 0.3, sodiumMg: 8, potassiumMg: 507, magnesiumMg: 29, calciumMg: 13 }, 14, 'oz'),
    // Kosterina Crushed Tangerine listing.
    ingredient('Tangerine vinegar', { kcal: 167, carbs: 40, sugars: 40 }, 1, '1 tbsp', 15),
    ingredient('Lime juice', { kcal: 25, protein: 0.42, fat: 0.07, carbs: 8.42, fiber: 0.4, sugars: 1.69, sodiumMg: 2, potassiumMg: 117, magnesiumMg: 8, calciumMg: 14 }, 1, '1 tbsp', 15.1),
    ingredient('Kraft Garlic Aioli', { kcal: 600, fat: 60, satFat: 10, carbs: 6.67, sodiumMg: 433 }, 1, '1 tbsp', 15),
    // McCormick sodium; calories and carbs estimated.
    ingredient('Garlic salt', { kcal: 67, carbs: 16.7, sodiumMg: 34932 }, 3, 'g'),
  ],
})

/**
 * Keto Mantecol, homemade: 1 cup natural peanut butter, 140 g allulose, 1 egg white and 2 tbsp whey isolate,
 * 435 g for the batch (10 bars). Batch: 1,610 kcal, 79 g protein, 125 g fat, 188 g carbs, 22 g fiber, 140 g
 * allulose, 26 g net carbs. Stored per 100 g.
 */
const BATCH_G = 435
const perBatch = (g: number) => Math.round((g / BATCH_G) * 1000) / 10
const MANTECOL: NewFood = {
  name: 'Keto Mantecol',
  brand: null,
  barcode: null,
  per_100g: completeNutrients(
    { kcal: Math.round((1610 / BATCH_G) * 100), protein: perBatch(79), fat: perBatch(125), carbs: perBatch(188), fiber: perBatch(22), sugarAlcohols: perBatch(140) },
    false,
    'allulose',
  ),
  unit_conversions: [{ unit: '1 bar', grams: 43.5 }],
  ingredients_text: 'Natural unsweetened peanut butter, allulose, egg white, unflavored whey isolate',
  keto_notes: 'Homemade. The allulose (32 g per 100 g) is left out of net carbs.',
  carbs_exclude_fiber: false,
  source: 'manual',
  confidence: 'medium',
  fields_estimated: [],
  meta: { externalId: 'starter:keto-mantecol', sugarAlcoholType: 'allulose', sections: ['desserts'], portion: { amount: 50, unit: 'g' }, lastAmount: 50, lastUnit: 'g' },
}

/**
 * Keto Lemon Meringue Pie, homemade, 9 inches: almond flour crust, lemon curd filling and meringue, sweetened
 * with allulose. Per slice (1/8 pie): 285 kcal, 26 g fat, 7.4 g protein, 29.5 g carbs, 2.1 g fiber, 23.8 g
 * allulose, 3.6 g net carbs. A slice wasn't weighed, so its 120 g is an estimate; per slice the numbers are exact.
 */
const PIE_SLICE_G = 120
const perSlice = (g: number) => Math.round((g / PIE_SLICE_G) * 10000) / 100
const LEMON_PIE: NewFood = {
  name: 'Keto Lemon Meringue Pie',
  brand: null,
  barcode: null,
  per_100g: completeNutrients(
    { kcal: perSlice(285), protein: perSlice(7.4), fat: perSlice(26), carbs: perSlice(29.5), fiber: perSlice(2.1), sugarAlcohols: perSlice(23.8) },
    false,
    'allulose',
  ),
  unit_conversions: [{ unit: '1 slice', grams: PIE_SLICE_G }],
  ingredients_text: 'Almond flour crust, lemon curd filling, meringue; sweetened with allulose',
  keto_notes: 'Homemade, 8 slices per 9-inch pie. The allulose (23.8 g a slice) is left out of net carbs. Slice weight estimated at 120 g.',
  carbs_exclude_fiber: false,
  source: 'manual',
  confidence: 'medium',
  fields_estimated: ['slice weight'],
  meta: { externalId: 'starter:keto-lemon-pie', sugarAlcoholType: 'allulose', sections: ['desserts'], portion: { amount: 1, unit: '1 slice' }, lastAmount: 1, lastUnit: '1 slice' },
}

export const STARTER_FOODS: Food[] = [
  asStarter('6f1d2c3a-9b4e-4c7a-8e21-5a0c7d3b1e42', {
    ...guacamole,
    confidence: 'medium',
    fields_estimated: ['tangerine vinegar', 'garlic salt'],
    keto_notes: 'Avocado is 14 oz of flesh. The vinegar’s 6 g of sugar comes from one listing for Kosterina Crushed Tangerine.',
    meta: { ...guacamole.meta, externalId: 'starter:guacamole', meals: ['dinner'], portion: { amount: 4, unit: 'oz' }, lastAmount: 4, lastUnit: 'oz' },
  }),
  asStarter('d3a5e8b1-7c42-4f19-9e6d-2b8c0f4a7e63', MANTECOL),
  asStarter('8e2b6f14-c3d9-4a75-b1e8-5f0a9c7d2e84', LEMON_PIE),
]

const staple = (id: string, name: string, per100g: Nutrients, meta: NewFood['meta'], unitConversions: NewFood['unit_conversions'] = []): Food =>
  asStarter(id, {
    name,
    brand: null,
    barcode: null,
    per_100g: completeNutrients(per100g, false),
    unit_conversions: unitConversions,
    ingredients_text: null,
    keto_notes: null,
    carbs_exclude_fiber: false,
    source: 'database',
    confidence: 'high',
    fields_estimated: [],
    meta,
  })

/** What eggs get logged with, added only when you have no food of that kind yet. USDA values. */
export const STAPLES: { food: Food; have: (f: Food) => boolean }[] = [
  { food: staple('2c8e4a10-5d3f-4b7e-9a16-7e2f0c9b4d11', 'Salt', { sodiumMg: 38758, calciumMg: 24 }, { portion: { amount: 1, unit: 'g' } }), have: isPlainSalt },
  {
    food: staple('7b1f9e24-3a6c-4d58-8f02-1c4e6a8d2f33', 'Black pepper', { kcal: 251, protein: 10.4, fat: 3.3, carbs: 64, fiber: 25.3, potassiumMg: 1329, magnesiumMg: 171, calciumMg: 443 }, { portion: { amount: 1, unit: 'g' } }),
    have: isPepper,
  },
  {
    food: staple('c94d3b57-8e21-4f6a-b0d7-3f5a1e7c9b55', 'Avocado oil', { kcal: 884, fat: 100, satFat: 11.6, omega6: 12.5, omega3: 1 }, { portion: { amount: 1, unit: '1 tsp' } }, [{ unit: '1 tsp', grams: 4.5 }]),
    // Offered until you have a pourable avocado oil; a spray doesn't count for the pan.
    have: isCookingOil,
  },
]
