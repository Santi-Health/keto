import { describe, expect, it } from 'vitest'
import { a1cBand, estimateA1c, gmi } from './a1c'
import type { CgmDay } from './cgm'
import type { ReadingRow } from './readings'

const day = (d: string, mg: number, n = 288): CgmDay => ({
  id: d, day: d, points: Array.from({ length: n }, (_, i) => [i * 5, mg] as [number, number]), source: 'google_health', meta: {}, updated_at: '', deleted_at: null,
})
const days = (end: string, count: number, mg: number) => {
  const out: Record<string, CgmDay> = {}
  for (let i = 0; i < count; i++) {
    const d = new Date(`${end}T12:00:00`)
    d.setDate(d.getDate() - i)
    const id = d.toISOString().slice(0, 10)
    out[id] = day(id, mg)
  }
  return out
}
const lab = (date: string, value: number): ReadingRow => ({
  id: 'lab', taken_at: `${date}T12:00:00Z`, kind: 'lab', value, urine_level: null, context: 'other', note: null, predicted_value: null, unit: '%',
  meta: { test: 'HbA1c' }, updated_at: '', deleted_at: null,
})

describe('A1C estimate', () => {
  it('uses the GMI formula', () => {
    expect(gmi(103)).toBe(5.8) // 3.31 + 0.02392 × 103 = 5.77
    expect(gmi(154)).toBe(7)
    expect(a1cBand(5.6)).toBe('normal')
    expect(a1cBand(5.8)).toBe('prediabetes')
    expect(a1cBand(6.5)).toBe('diabetes')
  })

  it('gives an early estimate from a few days and a stronger one with more', () => {
    expect(estimateA1c(days('2026-10-31', 2, 103), [], '2026-10-31').estimate).toBeNull()
    const early = estimateA1c(days('2026-10-31', 6, 103), [], '2026-10-31')
    expect(early).toMatchObject({ estimate: 5.8, confidence: 'early', basedOnDays: 6, band: 'prediabetes' })
    expect(estimateA1c(days('2026-10-31', 40, 103), [], '2026-10-31').confidence).toBe('strong')
  })

  it('ignores partial days and calibrates to a lab result that overlaps CGM', () => {
    const cgm = { ...days('2026-10-31', 20, 103), '2026-11-01': day('2026-11-01', 200, 20) }
    const a = estimateA1c(cgm, [lab('2026-10-31', 5.5)], '2026-11-01')
    expect(a.quarter.meanGlucose).toBe(103)
    expect(a.personalOffset).toBe(-0.3)
    expect(a.estimate).toBe(5.5)
  })
})
