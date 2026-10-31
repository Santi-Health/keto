import { describe, expect, it } from 'vitest'
import { mapOffProduct, mapUsdaFood } from './foodApi'

describe('mapUsdaFood', () => {
  it('maps nutrient numbers, omega fats and household measures', () => {
    const food = mapUsdaFood({
      fdcId: 2707152,
      description: 'Egg, whole, raw',
      dataType: 'Survey (FNDDS)',
      foodNutrients: [
        { nutrientNumber: '208', value: 143 },
        { nutrientNumber: '203', value: 12.6 },
        { nutrientNumber: '204', value: 9.51 },
        { nutrientNumber: '205', value: 0.72 },
        { nutrientNumber: '291', value: 0 },
        { nutrientNumber: '307', value: 142 },
        { nutrientNumber: '601', value: 372 },
        { nutrientNumber: '319', value: 160 },
        { nutrientNumber: '618', value: 1.5 },
        { nutrientNumber: '619', value: 0.05 },
        { nutrientNumber: '621', value: 0.05 },
      ],
      foodMeasures: [
        { disseminationText: '1 egg', gramWeight: 50 },
        { disseminationText: 'Quantity not specified', gramWeight: 50 },
      ],
    })
    expect(food.per_100g).toMatchObject({ kcal: 143, protein: 12.6, netCarbs: 0.72, sodiumMg: 142, cholesterolMg: 372, retinolUg: 160 })
    expect(food.per_100g.omega3).toBeCloseTo(0.05) // DHA only; ALA total is a fallback
    expect(food.per_100g.omega6).toBe(1.5)
    expect(food.unit_conversions).toEqual([{ unit: '1 egg', grams: 50 }])
    expect(food.meta.externalId).toBe('usda:2707152')
  })

  it('title-cases branded names and flags fish', () => {
    const food = mapUsdaFood({
      fdcId: 1,
      description: 'SOLID WHITE ALBACORE TUNA IN WATER',
      dataType: 'Branded',
      brandOwner: 'STARKIST CO.',
      gtinUpc: '080000495044',
      servingSize: 56,
      servingSizeUnit: 'g',
      householdServingFullText: '1/4 cup',
      foodNutrients: [{ nutrientNumber: '203', value: 23 }],
    })
    expect(food.name).toBe('Solid White Albacore Tuna In Water')
    expect(food.meta.fishSpecies).toBe('tuna_albacore')
    expect(food.unit_conversions[0]).toEqual({ unit: '1 serving (1/4 cup)', grams: 56 })
  })
})

describe('mapOffProduct', () => {
  it('converts minerals from g to mg and keeps US labels counting fiber in carbs', () => {
    const food = mapOffProduct({
      code: '0123',
      product_name: 'Keto Bar',
      brands: 'Acme, Acme Foods',
      countries_tags: ['en:united-states'],
      additives_tags: ['en:e955'],
      nova_group: 4,
      serving_quantity: 40,
      serving_size: '1 bar (40 g)',
      ingredients_text: 'almonds, erythritol, sucralose',
      nutriments: {
        'energy-kcal_100g': 450,
        carbohydrates_100g: 30,
        fiber_100g: 15,
        polyols_100g: 10,
        sodium_100g: 0.3,
        proteins_100g: 20,
      },
    })
    expect(food.brand).toBe('Acme')
    expect(food.per_100g.sodiumMg).toBeCloseTo(300)
    expect(food.per_100g.netCarbs).toBe(5) // 30 − 15 fiber − 10 erythritol
    expect(food.meta.sweeteners).toEqual(['sucralose'])
    expect(food.meta.novaGroup).toBe(4)
    expect(food.unit_conversions).toEqual([{ unit: '1 serving (1 bar (40 g))', grams: 40 }])
  })

  it('does not subtract fiber again on EU labels', () => {
    const food = mapOffProduct({
      code: '1',
      product_name: 'Dark chocolate 85%',
      countries_tags: ['en:france'],
      nutriments: { carbohydrates_100g: 19, fiber_100g: 12 },
    })
    expect(food.carbs_exclude_fiber).toBe(true)
    expect(food.per_100g.netCarbs).toBe(19)
    expect(food.meta.heavyMetalRisk).toBe(true)
  })
})
