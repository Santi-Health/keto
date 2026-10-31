import { describe, expect, it } from 'vitest'
import type { LogEntry } from './foods'
import { estimateKetosis } from './ketosis'
import { fitKetoModel } from './ketoModel'
import type { ReadingRow } from './readings'

const DAY = 86_400_000
const start = Date.parse('2026-11-01T12:00:00Z')
const meal = (t: number, netCarbs: number): LogEntry => ({
  id: `m${t}`, eaten_at: new Date(t).toISOString(), meal: 'dinner', food_id: null, food_name: 'x', amount: 1, unit: 'g', grams: 100,
  nutrients: { netCarbs, protein: 40, kcal: 500 }, meta: {}, updated_at: '', deleted_at: null,
})
const ketone = (t: number, value: number): ReadingRow => ({
  id: `k${t}`, taken_at: new Date(t).toISOString(), kind: 'blood_ketone', value, urine_level: null, context: 'fasted', note: null,
  predicted_value: null, unit: 'mmol/L', meta: {}, updated_at: '', deleted_at: null,
})
const base = { exercises: [], netCarbLimit: 25, proteinTarget: 150 }

/** 20 days: dinner each evening (carbs alternate 10 g / 20 g), a morning reading at `factor` × the population estimate. */
function history(factor: number, days = 20) {
  const logs: LogEntry[] = []
  const readings: ReadingRow[] = []
  for (let d = 0; d < days; d++) {
    logs.push(meal(start + d * DAY, d % 2 ? 20 : 10))
    const at = start + d * DAY + 19 * 3_600_000
    const pop = estimateKetosis({ ...base, at, logs }).populationMid
    readings.push(ketone(at, Math.round(pop * factor * 100) / 100))
  }
  return { logs, readings }
}

describe('personal ketosis model', () => {
  it('stays on the population estimate with no readings', () => {
    const m = fitKetoModel({ ...base, readings: [], logs: [] })
    expect(m.adjuster).toBeNull()
    expect(m.confidence).toBe('none')
    expect(m.advice.ready).toBe(false)
  })

  it('moves only part of the way after one reading', () => {
    const { logs, readings } = history(2, 1)
    const m = fitKetoModel({ ...base, readings, logs })
    const adj = Math.exp(m.adjuster!.adjust(m.points[0].features))
    expect(adj).toBeGreaterThan(1.1)
    expect(adj).toBeLessThan(2)
  })

  it('learns someone who runs 60% higher, and beats the population estimate', () => {
    const { logs, readings } = history(1.6)
    const m = fitKetoModel({ ...base, readings, logs })
    const at = start + 20 * DAY + 19 * 3_600_000
    const e = estimateKetosis({ ...base, at, logs, model: m.adjuster })
    expect(e.mid / e.populationMid).toBeGreaterThan(1.45)
    expect(e.mid / e.populationMid).toBeLessThan(1.75)
    expect(m.personalError!).toBeLessThan(m.populationError!)
    expect(m.findings.join(' ')).toMatch(/higher than the general estimate/)
    expect(m.confidence).toBe('solid')
  })

  it('recommends a carb limit after 10 readings over 14 days', () => {
    const high = history(1.6)
    const m = fitKetoModel({ ...base, ...high })
    expect(m.advice.ready).toBe(true)
    expect(m.advice.limitG).toBeGreaterThan(25)
    const low = history(0.5)
    expect(fitKetoModel({ ...base, ...low }).advice.limitG ?? 0).toBeLessThan(25)
  })

  it('says how many readings and days are left before recommending', () => {
    const { logs, readings } = history(1, 4)
    const m = fitKetoModel({ ...base, readings, logs })
    expect(m.advice).toMatchObject({ ready: false, readingsNeeded: 6, daysNeeded: 11 })
  })
})
