import { describe, expect, it } from 'vitest'
import { buildLogEntry, type Food, type LogEntry, type Meal } from './foods'
import { suggestFixes, usualFoods } from './suggest'
import type { Targets } from './targets'

const food = (id: string, name: string, per100: Food['per_100g'], unit: string, grams: number, source: Food['source'] = 'manual'): Food => ({
  id, name, brand: null, barcode: null, per_100g: per100, unit_conversions: [{ unit, grams }], ingredients_text: null, keto_notes: null,
  carbs_exclude_fiber: false, source, confidence: 'high', fields_estimated: [], favorite: false, use_count: 0, last_used_at: null, meta: {},
  updated_at: '', deleted_at: null,
})
const eggs = food('egg', 'Eggs', { kcal: 143, protein: 12.6, fat: 9.5, netCarbs: 0.7, leuG: 1.09, potassiumMg: 138 }, '1 egg', 50)
const salmon = food('sal', 'Smoked salmon', { kcal: 117, protein: 18.3, fat: 4.3, netCarbs: 0, leuG: 1.49 }, '2 oz', 56)
const bread = food('br', 'Keto bread', { kcal: 167, protein: 16.7, fat: 4, netCarbs: 13, fiber: 30, leuG: 1 }, '1 slice', 30)
const roll = food('roll', 'Protein roll (recipe)', { kcal: 200, protein: 20, netCarbs: 3, leuG: 2 }, '1 serving', 150, 'recipe')
const at = (h: number) => new Date(2026, 9, 31, h).toISOString()
const log = (f: Food, amount: number, unit: string, meal: Meal, h = 12): LogEntry => ({ ...buildLogEntry(f, amount, unit, meal, new Date(at(h))), id: `${f.id}${meal}${amount}${h}`, updated_at: '', deleted_at: null })
const targets = { calories: 2000, proteinG: 150, netCarbsG: 25, fiberG: 25, potassiumMg: 4000, magnesiumMg: 400 } as Targets

describe('suggestions from your usual foods', () => {
  const history = [log(eggs, 2, '1 egg', 'breakfast', 7), log(eggs, 2, '1 egg', 'dinner', 19), log(salmon, 1, '2 oz', 'lunch', 12), log(salmon, 1, '2 oz', 'dinner', 19), log(bread, 2, '1 slice', 'breakfast', 7), log(bread, 1, '1 slice', 'lunch', 12), log(roll, 1, '1 serving', 'lunch'), log(roll, 1, '1 serving', 'lunch')]
  const foods = [eggs, salmon, bread, roll]

  it('learns usual foods and portions, skipping recipes', () => {
    const u = usualFoods(foods, history)
    expect(u.map((x) => x.food.id).sort()).toEqual(['br', 'egg', 'sal'])
    expect(u.find((x) => x.food.id === 'egg')).toMatchObject({ unit: '1 egg', usualSteps: 2 })
  })

  it('closes a small leucine gap at dinner with the cheapest food you eat there', () => {
    // 2 oz salmon ≈ 0.83 g leucine + 1 egg ≈ 0.55 g → short of 3 g.
    const day = [log(salmon, 1, '2 oz', 'dinner', 19), log(eggs, 1, '1 egg', 'dinner', 19), log(salmon, 2, '2 oz', 'lunch', 12), log(eggs, 3, '1 egg', 'breakfast', 7)]
    const tips = suggestFixes({ dayLogs: day, history, foods, targets, muscleGoal: 'build', fatBudget: null, past: false })
    const leu = tips.find((t) => t.goal === 'leucine' && t.text.includes('dinner'))!
    expect(leu.kind).toBe('add')
    expect(leu.text).toMatch(/^Add .*(Eggs|Smoked salmon).* (to|at) dinner$/)
    expect(leu.effect).toMatch(/of 3 g/)
  })

  it('says what would have done it on a past day', () => {
    const day = [log(eggs, 2, '1 egg', 'breakfast', 7)]
    const tips = suggestFixes({ dayLogs: day, history, foods, targets, muscleGoal: 'build', fatBudget: null, past: true })
    expect(tips[0].text).toMatch(/^Adding .* would have done it$/)
  })

  it('trims the biggest carb source when net carbs run over', () => {
    const day = [log(bread, 4, '1 slice', 'breakfast', 7), log(eggs, 3, '1 egg', 'breakfast', 7)]
    const tips = suggestFixes({ dayLogs: day, history, foods, targets: { ...targets, netCarbsG: 10 }, muscleGoal: 'build', fatBudget: null, past: false })
    const carbs = tips.find((t) => t.goal === 'netCarbs')!
    expect(carbs.kind).toBe('trim')
    expect(carbs.text).toMatch(/^Have 2 × 1 slice of Keto bread instead of 4 × 1 slice$/)
  })
  it('suggests a seasoning only when a couple of grams closes the gap, and adds at most one more usual portion', () => {
    const pepper = food('pep', 'Black pepper', { kcal: 251, protein: 10, potassiumMg: 1329, magnesiumMg: 171, netCarbs: 39 }, 'g', 1)
    const nusalt = food('nu', 'NuSalt', { potassiumMg: 52000 }, 'g', 1)
    const h = [...history, log(pepper, 1, 'g', 'dinner', 19), log(pepper, 1, 'g', 'lunch', 12), log(nusalt, 1, 'g', 'dinner', 19)]
    const all = [...foods, pepper, nusalt]
    const u = usualFoods(all, h)
    expect(u.find((x) => x.food.id === 'pep')).toMatchObject({ step: 1, seasoning: true, maxSteps: 3 })
    expect(u.find((x) => x.food.id === 'egg')).toMatchObject({ seasoning: false, maxSteps: 2 })
    const day = [log(eggs, 2, '1 egg', 'breakfast', 7)]
    // Potassium 1,000 mg short: 2 g of NuSalt closes it; pepper can't, so it's never offered as a partial fix.
    const tips = suggestFixes({ dayLogs: day, history: h, foods: all, targets: { ...targets, potassiumMg: 138 + 1000 }, muscleGoal: 'build', fatBudget: null, past: false })
    expect(tips.find((t) => t.goal === 'potassium')?.text).toBe('Add 2 g NuSalt')
    expect(tips.some((t) => t.text.includes('pepper'))).toBe(false)
    // 4,000 mg short is more than a couple of grams of NuSalt.
    const big = suggestFixes({ dayLogs: day, history: h, foods: all, targets: { ...targets, potassiumMg: 5000 }, muscleGoal: 'build', fatBudget: null, past: false })
    expect(big.some((t) => t.text.includes('NuSalt'))).toBe(false)
    for (const t of tips.filter((x) => x.text.includes('Eggs'))) expect(Number(t.text.match(/(\d+(\.\d+)?) ?×? ?1 egg/)?.[1] ?? 0)).toBeLessThanOrEqual(2)
  })
  it('suggests a food once, with every gap it helps, counting it before looking at the next gap', () => {
    // A day full of everything except vitamin D and B12; smoked salmon covers both.
    const plenty = { folateUg: 1000, vitCMg: 300, vitKUg: 300, vitAUg: 2000, vitEMg: 40, thiaminMg: 3, b6Mg: 4, zincMg: 30, seleniumUg: 150, cholineMg: 1500, calciumMg: 2000, ironMg: 20 }
    const multi = food('mul', 'Multi', { kcal: 100, protein: 40, fiber: 30, sodiumMg: 4000, potassiumMg: 4000, magnesiumMg: 400, leuG: 3.5, vitDUg: 1, b12Ug: 0.2, ...plenty }, '1 serving', 100)
    const fish = food('fish', 'Smoked salmon', { kcal: 117, protein: 18.3, fat: 4.3, netCarbs: 0, leuG: 1.49, vitDUg: 17, b12Ug: 3.3 }, '2 oz', 56)
    const h = [log(fish, 2, '2 oz', 'dinner', 19), log(fish, 2, '2 oz', 'lunch', 12)]
    const day = [log(multi, 1, '1 serving', 'lunch', 12)]
    const tips = suggestFixes({ dayLogs: day, history: h, foods: [multi, fish], targets: { ...targets, calories: 3000 }, muscleGoal: 'build', fatBudget: null, past: false, sex: 'male' })
    const salmon = tips.filter((t) => t.text.includes('Smoked salmon'))
    expect(salmon).toHaveLength(1)
    expect(salmon[0].effect).toMatch(/Vitamin D \(reaches/)
    expect(salmon[0].effect).toMatch(/Vitamin B12 \(reaches/)
  })
  it('avoids a food that would push saturated fat over, and warns when nothing else works', () => {
    const egg = food('egg2', 'Eggs', { kcal: 143, protein: 12.6, fat: 9.5, satFat: 3.1, netCarbs: 0.7, leuG: 1.09 }, '1 egg', 50)
    const whites = food('wh', 'Egg whites', { kcal: 52, protein: 10.9, fat: 0.2, satFat: 0, netCarbs: 0.7, leuG: 0.95 }, 'oz', 28.35)
    const butter = food('bu', 'Butter', { kcal: 717, fat: 81, satFat: 51, protein: 0.9 }, 'tbsp', 14)
    const h = [log(egg, 2, '1 egg', 'breakfast', 7), log(egg, 2, '1 egg', 'lunch', 12), log(whites, 8, 'oz', 'breakfast', 7), log(whites, 8, 'oz', 'lunch', 12)]
    // About 20 g saturated fat already; the limit at 2,000 kcal is 22 g. 2 more eggs add 3.1 g, egg whites add none.
    const day = [log(butter, 2.1, 'tbsp', 'lunch', 12), log(egg, 3, '1 egg', 'breakfast', 7)]
    const watch = { ctx: { calorieTarget: 2000, weightKg: 68 }, weekItems: [] }
    const tips = suggestFixes({ dayLogs: day, history: h, foods: [egg, whites, butter], targets, muscleGoal: 'build', fatBudget: null, past: false, watch })
    const breakfast = tips.find((t) => t.goal === 'leucine' && t.text.includes('breakfast'))!
    expect(breakfast.text).toContain('Egg whites')
    expect(breakfast.warning).toBeUndefined()
    // With only whole eggs to choose from, it still helps but says what it costs.
    const onlyEggs = suggestFixes({ dayLogs: day, history: h.filter((l) => l.food_id === 'egg2'), foods: [egg, butter], targets, muscleGoal: 'build', fatBudget: null, past: false, watch })
    const w = onlyEggs.find((t) => t.text.includes('breakfast'))!
    expect(w.warning).toMatch(/^Puts you over saturated fat \(\d+ of 22 g\)/)
  })
})
