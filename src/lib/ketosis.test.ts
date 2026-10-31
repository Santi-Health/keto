import { describe, expect, it } from 'vitest'
import type { Exercise } from './exercise'
import type { LogEntry } from './foods'
import { estimateKetosis } from './ketosis'

const at = (d: string) => Date.parse(d)
const log = (when: string, netCarbs: number | undefined, protein = 20): LogEntry => ({
  id: when + netCarbs,
  eaten_at: when,
  meal: 'lunch',
  food_id: null,
  food_name: 'x',
  amount: 1,
  unit: 'g',
  grams: 100,
  nutrients: { netCarbs, protein, kcal: 200 },
  meta: {},
  updated_at: '',
  deleted_at: null,
})
const run: Exercise = {
  id: 'r', started_at: '2026-10-30T15:29:00Z', kind: 'cardio', duration_min: 19, intensity: 'high', calories: 160,
  source: 'fitbit', external_id: 'x', note: null, meta: {}, updated_at: '', deleted_at: null,
}
const base = { netCarbLimit: 25, proteinTarget: 150 }

describe('estimateKetosis', () => {
  it('says out of ketosis after a big carb day, even with exercise', () => {
    const e = estimateKetosis({ ...base, at: at('2026-10-31T06:00:00Z'), logs: [log('2026-10-31T05:44:00Z', 105), log('2026-10-30T14:00:00Z', 17)], exercises: [run] })
    expect(e.status).toBe('out')
    expect(e.carbs24h).toBe(122)
    expect(e.reasons.join(' ')).toContain('not enough to offset')
  })

  it('is in ketosis on a low-carb day with an overnight fast', () => {
    const e = estimateKetosis({ ...base, at: at('2026-10-31T14:00:00Z'), logs: [log('2026-10-30T19:00:00Z', 8), log('2026-10-30T23:00:00Z', 6)], exercises: [] })
    expect(e.status).toBe('in')
    expect(e.mid).toBeGreaterThanOrEqual(0.9)
    expect(e.low).toBeLessThan(e.mid)
    expect(e.high).toBeGreaterThan(e.mid)
  })

  it('warns when a food has no carb data', () => {
    const e = estimateKetosis({ ...base, at: at('2026-10-31T06:00:00Z'), logs: [log('2026-10-31T04:00:00Z', undefined)], exercises: [] })
    expect(e.unknownCarbItems).toBe(1)
  })
})
