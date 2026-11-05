import { completeNutrients, type Food, type NewFood } from './foods'
import type { Nutrients } from './nutrients'
import { isAvocadoOil, isPepper, isPlainSalt } from './quickFoods'
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

export const STARTER_FOODS: Food[] = [
  asStarter('6f1d2c3a-9b4e-4c7a-8e21-5a0c7d3b1e42', {
    ...guacamole,
    confidence: 'medium',
    fields_estimated: ['tangerine vinegar', 'garlic salt'],
    keto_notes: 'Avocado is 14 oz of flesh. The vinegar’s 6 g of sugar comes from one listing for Kosterina Crushed Tangerine.',
    meta: { ...guacamole.meta, externalId: 'starter:guacamole', meals: ['dinner'], portion: { amount: 4, unit: 'oz' }, lastAmount: 4, lastUnit: 'oz' },
  }),
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
    have: isAvocadoOil,
  },
]
