import { describe, expect, it } from 'vitest'
import type { ActivityDay } from './activity'
import { readinessFor } from './readiness'

const row = (day: string, rhr: number, hrv: number | undefined, sleep: number): ActivityDay => ({
  id: day, day, steps: 8000, calories_out: 2500, resting_hr: rhr, sleep_minutes: sleep, meta: hrv == null ? {} : { hrvMs: hrv }, updated_at: '', deleted_at: null,
})
const month = (last: ActivityDay) => {
  const out: Record<string, ActivityDay> = { [last.day]: last }
  for (let i = 1; i <= 30; i++) {
    const d = new Date(`${last.day}T12:00:00`)
    d.setDate(d.getDate() - i)
    const id = d.toISOString().slice(0, 10)
    out[id] = row(id, 56, 40, 450)
  }
  return out
}

describe('readiness', () => {
  it('scores a normal, well-slept day in the low 70s', () => {
    const r = readinessFor('2026-10-31', month(row('2026-10-31', 56, 40, 450)))!
    expect(r.score).toBe(72)
  })

  it('is high with HRV up, resting HR down and good sleep', () => {
    const r = readinessFor('2026-10-31', month(row('2026-10-31', 53, 50, 480)))!
    expect(r.band).toBe('high')
    expect(r.parts.find((p) => p.label === 'HRV')!.detail).toMatch(/25% above your normal \(40\)/)
  })

  it('is low after a short night with HRV down and resting HR up', () => {
    const r = readinessFor('2026-10-31', month(row('2026-10-31', 61, 30, 300)))!
    expect(r.band).toBe('low')
  })

  it('works without HRV, and needs at least two signals', () => {
    const r = readinessFor('2026-10-31', month(row('2026-10-31', 56, undefined, 450)))!
    expect(r.missing).toEqual(['HRV'])
    expect(readinessFor('2026-10-31', { '2026-10-31': row('2026-10-31', 56, undefined, 450) })).toBeNull()
  })
})
