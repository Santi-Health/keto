import { describe, expect, it } from 'vitest'
import type { LogEntry } from './foods'
import { glucoseFlag, gkiBand, gkiFor, guessContext, hoursSinceFood, weightTrend, type ReadingRow } from './readings'

const r = (kind: ReadingRow['kind'], taken_at: string, value: number | null, context: ReadingRow['context'] = 'other'): ReadingRow => ({
  id: kind + taken_at,
  taken_at,
  kind,
  value,
  urine_level: null,
  context,
  note: null,
  predicted_value: null,
  unit: null,
  meta: {},
  updated_at: '',
  deleted_at: null,
})
const meal = (eaten_at: string) => ({ eaten_at }) as LogEntry

describe('GKI', () => {
  it('pairs a ketone reading with a finger-stick within 30 minutes', () => {
    const k = r('blood_ketone', '2026-10-31T13:00:00Z', 1.2)
    const g = gkiFor(k, [k, r('glucose', '2026-10-31T13:10:00Z', 90)])!
    expect(g.value).toBe(4.2) // 90/18 = 5 mmol/L ÷ 1.2
    expect(g.glucoseSource).toBe('finger-stick')
    expect(gkiBand(g.value)).toBe('moderate ketosis')
  })

  it('falls back to the CGM, and gives up without glucose nearby', () => {
    const k = r('blood_ketone', '2026-10-31T13:00:00Z', 0.5)
    const t = Date.parse('2026-10-31T13:05:00Z')
    expect(gkiFor(k, [k], [{ t, v: 99 }])).toMatchObject({ value: 11, glucoseSource: 'CGM' })
    expect(gkiFor(k, [k, r('glucose', '2026-10-31T14:00:00Z', 90)])).toBeNull()
  })
})

describe('glucose flags', () => {
  it('uses fasting ranges for fasted readings', () => {
    expect(glucoseFlag({ value: 95, context: 'fasted' })).toBeNull()
    expect(glucoseFlag({ value: 108, context: 'fasted' })).toContain('prediabetes')
    expect(glucoseFlag({ value: 150, context: 'post_meal_1h' })).toBeNull()
    expect(glucoseFlag({ value: 190, context: 'post_meal_1h' })).toContain('180')
    expect(glucoseFlag({ value: 65, context: 'other' })).toContain('70')
  })
})

describe('context and fasting', () => {
  it('guesses fasted in the morning after a long gap, and 1 h after a meal', () => {
    expect(guessContext(new Date(2026, 9, 31, 7, 0), [meal(new Date(2026, 9, 30, 20, 0).toISOString())])).toBe('fasted')
    expect(guessContext(new Date(2026, 9, 31, 13, 0), [meal(new Date(2026, 9, 31, 12, 0).toISOString())])).toBe('post_meal_1h')
  })

  it('counts hours since the last food', () => {
    expect(hoursSinceFood([meal('2026-10-31T00:00:00Z')], Date.parse('2026-10-31T14:30:00Z'))).toBe(14.5)
    expect(hoursSinceFood([])).toBeNull()
  })
})

describe('weight trend', () => {
  it('reports change per week', () => {
    const now = Date.parse('2026-10-31T12:00:00Z')
    const rows = [0, 7, 14].map((d) => r('weight', new Date(now - (14 - d) * 86_400_000).toISOString(), 70 - d / 14))
    expect(weightTrend(rows, 28, now)).toBeCloseTo(-0.5, 5)
  })
})
