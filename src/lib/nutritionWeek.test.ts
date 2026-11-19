import { describe, expect, it } from 'vitest'
import { judgeNutrition, nutritionRows, planWeekVerdict, windowDays, type NutritionDay } from './nutritionWeek'

const goals = { proteinG: 149, netCarbsG: 25, fatMinG: 44 }
const day = (i: number, o: Partial<NutritionDay> = {}): NutritionDay => ({
  day: `2026-11-${String(10 + i).padStart(2, '0')}`,
  logged: true,
  refeed: false,
  deficit: 500,
  burned: 2900,
  kcal: 2400,
  protein: 160,
  netCarbs: 20,
  fat: 120,
  ...o,
})

describe('nutrition week', () => {
  it('counts the days each goal was hit, newest day at age 0', () => {
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => day(i, i === 6 ? { netCarbs: 47 } : i === 0 ? { protein: 100 } : {}))
    const rows = Object.fromEntries(nutritionRows(days, goals).map((r) => [r.key, r]))
    expect(rows.deficit).toMatchObject({ hits: 7, need: 5, avg: 500 })
    expect(rows.protein.hits).toBe(6)
    expect(rows.protein.byAge[6]).toBe(0)
    expect(rows.netCarbs.hits).toBe(6)
    expect(rows.netCarbs.byAge[0]).toBe(0)
    expect(rows.fat.hits).toBe(7)
  })

  it('treats too big a deficit and unlogged days as misses, and a refeed day as a hit for deficit and carbs', () => {
    const rows = Object.fromEntries(
      nutritionRows([day(0, { deficit: 1200 }), day(1, { logged: false }), day(2, { refeed: true, deficit: -300, netCarbs: 150 })], goals).map((r) => [r.key, r]),
    )
    expect(rows.deficit.hits).toBe(1)
    expect(rows.netCarbs.hits).toBe(2)
    expect(rows.protein.hits).toBe(2)
  })

  it('judges a week and a plan week', () => {
    const good = nutritionRows([0, 1, 2, 3, 4, 5, 6].map((i) => day(i)), goals)
    expect(judgeNutrition(good)).toEqual({ verdict: 'good', met: 4 })
    const carbsOff = nutritionRows([0, 1, 2, 3, 4, 5, 6].map((i) => day(i, { netCarbs: 60 })), goals)
    expect(judgeNutrition(carbsOff).verdict).toBe('close')
    expect(planWeekVerdict(0.7, true)).toBe('good')
    expect(planWeekVerdict(0.7, false)).toBe('close')
    expect(planWeekVerdict(-0.4, true)).toBe('close')
    expect(planWeekVerdict(-1, true)).toBe('behind')
  })

  it('uses the 7 finished days before today', () => {
    expect(windowDays('2026-11-18', '2026-11-18')).toEqual(['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'])
    expect(windowDays('2026-11-15', '2026-11-18').at(-1)).toBe('2026-11-15')
  })
})
