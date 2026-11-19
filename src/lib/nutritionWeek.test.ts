import { describe, expect, it } from 'vitest'
import { foodRows, judgePlanWeek, windowDays, type NutritionDay } from './nutritionWeek'

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

  it('marks a plan week from lifting and food together', () => {
    expect(judgePlanWeek(7, 7, 2)).toBe('good')
    expect(judgePlanWeek(5, 7, 2)).toBe('close')
    expect(judgePlanWeek(7, 7, 1)).toBe('close')
    expect(judgePlanWeek(4, 7, 0)).toBe('behind')
  })

  it('uses the 7 finished days before today', () => {
    expect(windowDays('2026-11-18', '2026-11-18')).toEqual(['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'])
    expect(windowDays('2026-11-15', '2026-11-18').at(-1)).toBe('2026-11-15')
  })
})
