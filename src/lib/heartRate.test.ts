import { describe, expect, it } from 'vitest'
import { heartRateKcal } from './exercise'
import { averageHr, parseHeartRate } from './googleHealth'

describe('heart-rate calories', () => {
  it('uses the Keytel formula minus resting burn', () => {
    // 42-year-old man, 68 kg, 140 bpm for 30 min: 13.2 kcal/min total, 1.1 resting → ~363.
    const kcal = heartRateKcal({ avgHr: 140, minutes: 30, weightKg: 68, age: 42, sex: 'male', bmrPerDay: 1560 })
    expect(kcal).toBeGreaterThan(340)
    expect(kcal).toBeLessThan(380)
    // Gentle yoga around 70 bpm for 50 min lands near the 2.5-MET estimate (~85 kcal).
    const yoga = heartRateKcal({ avgHr: 70, minutes: 50, weightKg: 68, age: 42, sex: 'male', bmrPerDay: 1560 })
    expect(yoga).toBeGreaterThan(50)
    expect(yoga).toBeLessThan(110)
  })

  it('never goes below zero at resting heart rates', () => {
    expect(heartRateKcal({ avgHr: 55, minutes: 50, weightKg: 68, age: 42, sex: 'male', bmrPerDay: 1560 })).toBe(0)
  })

  it('reads Google Health samples and averages them by time', () => {
    expect(parseHeartRate({ heartRate: { beatsPerMinute: '128', sampleTime: { physicalTime: '2026-10-31T15:00:00Z' } } })).toEqual({
      t: Date.parse('2026-10-31T15:00:00Z'),
      bpm: 128,
    })
    const t0 = Date.parse('2026-10-31T15:00:00Z')
    // 10 minutes at 100 bpm sampled every 60 s, then a burst of 20 samples at 160 in 20 s.
    const samples = [
      ...Array.from({ length: 10 }, (_, i) => ({ t: t0 + i * 60_000, bpm: 100 })),
      ...Array.from({ length: 20 }, (_, i) => ({ t: t0 + 600_000 + i * 1_000, bpm: 160 })),
    ]
    const avg = averageHr(samples, t0, t0 + 620_000)!
    expect(avg).toBeGreaterThan(100)
    expect(avg).toBeLessThan(105)
    expect(averageHr(samples.slice(0, 2), t0, t0 + 620_000)).toBeNull()
  })
})
