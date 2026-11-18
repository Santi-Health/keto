import { describe, expect, it } from 'vitest'
import { MISSED_DINNER, dataFixes } from './dataFixes'
import type { Food, LogEntry } from './foods'

const food = (id: string, name: string, brand: string | null, per_100g: Food['per_100g']) =>
  ({ id, name, brand, per_100g, meta: {}, carbs_exclude_fiber: false, deleted_at: null }) as unknown as Food
const log = (id: string, food_id: string | null, grams: number, nutrients: LogEntry['nutrients'], eaten_at = '2026-11-12T20:00:00Z') =>
  ({ id, food_id, grams, nutrients, eaten_at, food_name: 'x', meal: 'dinner', amount: 1, unit: 'g', meta: {}, deleted_at: null }) as unknown as LogEntry

const seaweed = food('s', 'Seaweed Salad', 'Pada Sushi', { kcal: 125, fat: 5.36, carbs: 28.6, fiber: 50, netCarbs: 0 })
const salmon = food('p', 'Wild Caught Alaskan Pink Salmon in Spring Water', 'Chicken of the Sea', { kcal: 100, protein: 15, fat: 210, carbs: 0, netCarbs: 0 })
const butter = food('b', 'Pure Irish Butter', 'Kerrygold', { kcal: 714, fat: 39.3, carbs: 0, netCarbs: 0 })

describe('one-time data fixes', () => {
  it('fixes the three foods and only the wrong fields of their past logs', () => {
    const logs = [log('1', 's', 252, { kcal: 315, fiber: 126, netCarbs: 0 }), log('2', 'p', 140, { kcal: 140, fat: 294 })]
    const r = dataFixes([seaweed, salmon, butter], logs)
    const f = Object.fromEntries(r.foods.map((x) => [x.id, x]))
    expect(f.s.per_100g.netCarbs).toBe(25)
    expect(f.p.per_100g.fat).toBe(2.1)
    expect(f.b.per_100g.fat).toBe(78.6)
    const l = Object.fromEntries(r.logs.map((x) => [x.id, x]))
    expect(l['1'].nutrients.netCarbs).toBeCloseTo(63, 1)
    expect(l['1'].nutrients.kcal).toBe(315)
    expect(l['2'].nutrients.fat).toBeCloseTo(2.94, 2)
    expect(l['2'].nutrients.kcal).toBe(140)
  })

  it('leaves foods already corrected alone', () => {
    const ok = { ...salmon, per_100g: { ...salmon.per_100g, fat: 3 } }
    expect(dataFixes([ok], [MISSED_DINNER as LogEntry]).foods).toEqual([])
  })

  it('adds the Nov 6 dinner once, and not if a dinner is already logged that evening', () => {
    const r = dataFixes([], [])
    expect(r.logs.map((l) => l.id)).toEqual([MISSED_DINNER.id])
    expect(r.logs[0].nutrients.kcal).toBe(1000)
    expect(dataFixes([], r.logs).logs).toEqual([])
    expect(dataFixes([], [log('d', null, 300, { kcal: 600 }, '2026-11-07T04:00:00Z')]).logs).toEqual([])
    // The 3:42 PM snack doesn't count as dinner.
    expect(dataFixes([], [log('a', null, 28, { kcal: 164 }, '2026-11-06T23:42:32Z')]).logs).toHaveLength(1)
  })
})
