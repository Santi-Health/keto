import { describe, expect, it } from 'vitest'
import { liftKg, liftLoadKg, liftUnit, liftWeight, repsPerSide, type Lift } from './exercise'

const base: Lift = { name: 'Chest press', weightLb: null, reps: 8, sets: 4 }

describe('lift weight', () => {
  it('reads legacy lb entries', () => {
    const l = { ...base, weightLb: 95 }
    expect(liftWeight(l)).toBe(95)
    expect(liftUnit(l)).toBe('lb')
    expect(liftKg(l)).toBeCloseTo(43.09, 1)
  })
  it('keeps the unit the user entered', () => {
    const l = { ...base, weight: 20, unit: 'kg' as const }
    expect(liftWeight(l)).toBe(20)
    expect(liftKg(l)).toBe(20)
  })
  it('prefers the new weight over the legacy field', () => {
    expect(liftWeight({ ...base, weight: 30, weightLb: 95 })).toBe(30)
  })
  it('returns null when no weight was entered', () => {
    expect(liftKg(base)).toBeNull()
  })
})

describe('two bells and one side', () => {
  const l: Lift = { name: 'Double kettlebell split squat', weightLb: null, weight: 28, unit: 'kg', reps: 14, sets: 2 }
  it('doubles the load for two bells; moved together, each arm does every rep', () => {
    expect(liftLoadKg({ ...l, bells: 2 })).toBe(56)
    expect(repsPerSide({ ...l, bells: 2 })).toBe(14)
    expect(repsPerSide({ ...l, bells: 2, side: 'both' })).toBe(7)
  })
  it('splits reps for one side at a time, and keeps them for a single side', () => {
    expect(repsPerSide({ ...l, side: 'both' })).toBe(7)
    expect(repsPerSide({ ...l, side: 'left' })).toBe(14)
    expect(liftLoadKg(l)).toBe(28)
  })
})
