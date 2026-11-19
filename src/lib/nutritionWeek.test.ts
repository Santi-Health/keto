import { describe, expect, it } from 'vitest'
import { foodLight, foodRows, liftLight, windowDays, type NutritionDay } from './nutritionWeek'

const day = (i: number, o: Partial<NutritionDay> = {}): NutritionDay => ({
  day: `2026-11-${String(10 + i).padStart(2, '0')}`,
  logged: true,
  refeed: false,
  deficit: 500,
  protein: 160,
  ...o,
})

describe('food week', () => {
  it('judges the average deficit (500+) and protein (150+), not single days', () => {
    // Last week: a surplus day and some big-deficit days still average well over 500.
    const deficits = [-268, 608, 1207, 1189, 358, 1489, 1582]
    const rows = Object.fromEntries(foodRows(deficits.map((d, i) => day(i, { deficit: d, protein: 174 }))).map((r) => [r.key, r]))
    expect(rows.deficit).toMatchObject({ avg: 881, goal: 500, met: true, days: 7 })
    expect(rows.protein).toMatchObject({ avg: 174, met: true })
    // The bar pieces add up to the average; a surplus day adds nothing.
    expect(rows.deficit.byAge.reduce((a, b) => a + b, 0)).toBeCloseTo((881 * 7 + 268) / 7, 0)
    expect(rows.deficit.byAge[6]).toBe(0)
  })

  it('leaves unlogged days out, and a refeed day out of the deficit', () => {
    const rows = Object.fromEntries(foodRows([day(0, { deficit: 300, protein: 140 }), day(1, { logged: false }), day(2, { refeed: true, deficit: -800 })]).map((r) => [r.key, r]))
    expect(rows.deficit).toMatchObject({ avg: 300, days: 1, met: false })
    expect(rows.protein).toMatchObject({ avg: 150, days: 2, met: true })
  })

  it('uses the 7 finished days before today', () => {
    expect(windowDays('2026-11-18', '2026-11-18')).toEqual(['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'])
    expect(windowDays('2026-11-15', '2026-11-18').at(-1)).toBe('2026-11-15')
  })

  it('lights lifting and food green when met, yellow within 10%, red beyond', () => {
    const g = (sets: number, target: number) => ({ sets, target })
    expect(liftLight([g(12, 12), g(10, 10)])).toBe('green')
    expect(liftLight([g(11, 12), g(10, 10)])).toBe('yellow')
    // Extra chest doesn't make up for missing legs.
    expect(liftLight([g(20, 12), g(5, 10)])).toBe('red')
    expect(liftLight([g(0, 12)], true)).toBe('green')
    const food = (deficit: number, protein: number) => foodLight(foodRows([day(0, { deficit, protein })]))
    expect(food(600, 160)).toBe('green')
    expect(food(460, 160)).toBe('yellow')
    expect(food(600, 130)).toBe('red')
    expect(foodLight(foodRows([day(0, { logged: false })]))).toBe('none')
  })
})
