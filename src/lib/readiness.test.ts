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
  it('scores a normal, well-slept day in the high 70s', () => {
    const r = readinessFor('2026-10-31', month(row('2026-10-31', 56, 40, 450)))!
    expect(r.score).toBe(78)
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

describe('short sleep', () => {
  it('caps the score after a short night even when HRV and resting HR look great', () => {
    // Like Oct 31: HRV well above normal, resting HR a beat below, but only 5h 19m asleep.
    const r = readinessFor('2026-10-31', month(row('2026-10-31', 55, 46, 319)))!
    expect(r.cappedBySleep).toEqual({ cap: 53, minutes: 319 })
    expect(r.score).toBe(53)
    expect(r.band).toBe('moderate')
  })

  it('leaves a full night uncapped', () => {
    expect(readinessFor('2026-10-31', month(row('2026-10-31', 55, 46, 420)))!.cappedBySleep).toBeUndefined()
  })
})

describe('overnight vitals', () => {
  const at = (n: number) => {
    const d = new Date('2026-11-08T12:00:00')
    d.setDate(d.getDate() - n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const day = (n: number, meta: ActivityDay['meta'], over: Partial<ActivityDay> = {}): ActivityDay => ({
    id: at(n), day: at(n), steps: 8000, calories_out: 2500, resting_hr: 55, sleep_minutes: 450, meta: { hrvMs: 40, ...meta }, updated_at: '', deleted_at: null, ...over,
  })
  const usual = { breathingRate: 14, skinTempC: 33.5, spo2Pct: 96 }
  const history = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [at(i + 1), day(i + 1, usual)]))

  it('leaves a tired night alone when the vitals are normal', () => {
    const r = readinessFor(at(0), { ...history, [at(0)]: day(0, { ...usual, hrvMs: 32 }, { sleep_minutes: 400 }) })!
    expect(r.illness).toBeUndefined()
    expect(r.vitals.map((v) => v.label)).toEqual(['Skin temp', 'Breathing', 'Blood oxygen'])
    expect(r.vitals.every((v) => !v.sign)).toBe(true)
  })

  it('holds a sick night near the bottom even with decent HRV and sleep', () => {
    const r = readinessFor(at(0), { ...history, [at(0)]: day(0, { breathingRate: 16, skinTempC: 34.7, spo2Pct: 95.5 }) })!
    expect(r.illness?.signs).toHaveLength(2)
    expect(r.score).toBeLessThanOrEqual(25)
    expect(r.band).toBe('low')
  })

  it('one sign keeps the score in the low band', () => {
    const r = readinessFor(at(0), { ...history, [at(0)]: day(0, { ...usual, skinTempC: 34.4 }) })!
    expect(r.illness?.signs).toEqual(['skin temp'])
    expect(r.vitals[0].short).toBe('+0.9 °C')
    expect(r.score).toBeLessThanOrEqual(44)
  })

  it("uses Fitbit's own skin temperature baseline when it sends one", () => {
    const r = readinessFor(at(0), { ...history, [at(0)]: day(0, { ...usual, skinTempC: 34.4, skinTempBaseC: 34.0 }) })!
    expect(r.vitals[0].short).toBe('+0.4 °C')
    expect(r.illness).toBeUndefined()
  })
})
