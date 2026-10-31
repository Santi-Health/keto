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
})
