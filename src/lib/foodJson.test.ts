import { describe, expect, it } from 'vitest'
import { looksLikeRestaurant, parseLabelJson, parseRestaurantJson } from './foodJson'

const label = `Here you go:
\`\`\`json
{
  "name": "Keto Bar", "brand": "Acme", "barcode": "0 12345 67890 5",
  "serving": { "label": "1 bar", "grams": 40 },
  "per_100g": { "calories": 450, "protein_g": 25, "fat_g": 30, "carbs_total_g": 40, "fiber_g": 20,
    "sugar_alcohols": [{ "type": "erythritol", "g": 10 }], "sodium_mg": 300, "potassium_mg": 200 },
  "sweeteners": ["sucralose"],
  "keto_notes": "Contains soluble corn fiber.",
  "source": "label_photo", "confidence": "medium", "fields_estimated": ["potassium_mg"]
}
\`\`\``

describe('Claude chat JSON', () => {
  it('reads a label reply wrapped in prose and code fences', () => {
    const f = parseLabelJson(label)
    expect(f.name).toBe('Keto Bar')
    expect(f.barcode).toBe('012345678905')
    expect(f.per_100g.kcal).toBe(450)
    expect(f.per_100g.netCarbs).toBe(10) // 40 − 20 fiber − 10 erythritol
    expect(f.unit_conversions[0]).toEqual({ unit: '1 bar', grams: 40 })
    expect(f.fields_estimated).toEqual(['potassiumMg'])
    expect(f.meta.sweeteners).toEqual(['sucralose'])
    expect(f.confidence).toBe('medium')
  })

  it('explains what is wrong with a bad paste', () => {
    expect(() => parseLabelJson('sorry, I cannot read it')).toThrow(/JSON/)
    expect(() => parseLabelJson('{"name": "x", "per_100g": {}}')).toThrow(/nutrition values/)
  })

  it('reads a restaurant dish and tells the two kinds apart', () => {
    const text = '{"name":"Salmon teriyaki","restaurant":"Ozumo","menu_calories":720,"ingredients":["6 oz salmon fillet","2 tbsp teriyaki sauce"],"hidden_carbs":["teriyaki glaze"],"confidence":"low"}'
    expect(looksLikeRestaurant(text)).toBe(true)
    expect(looksLikeRestaurant(label)).toBe(false)
    expect(parseRestaurantJson(text)).toMatchObject({ menuCalories: 720, confidence: 'low', ingredients: ['6 oz salmon fillet', '2 tbsp teriyaki sauce'] })
  })
})
