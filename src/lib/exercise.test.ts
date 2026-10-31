import { describe, expect, it } from 'vitest'
import { daysSinceStrength, estimateExerciseKcal, trainingWarnings, type Exercise } from './exercise'

const ex = (overrides: Partial<Exercise>): Exercise => ({
  id: 'e',
  started_at: '2026-10-30T18:00:00Z',
  kind: 'strength',
  duration_min: 45,
  intensity: 'moderate',
  calories: null,
  source: 'manual',
  external_id: null,
  note: null,
  meta: {},
  updated_at: '',
  deleted_at: null,
  ...overrides,
})

describe('estimateExerciseKcal', () => {
  it('counts only calories above resting: (MET − 1) × kg × hours', () => {
    // moderate strength 5 MET, 68 kg, 1 h → 4 × 68 = 272
    expect(estimateExerciseKcal('strength', 'moderate', 60, 68)).toBe(272)
    expect(estimateExerciseKcal('walking', 'moderate', 30, 68)).toBe(85)
  })
})

describe('daysSinceStrength', () => {
  const now = new Date(2026, 9, 30, 20)
  it('counts calendar days to the last strength session', () => {
    expect(daysSinceStrength([ex({ started_at: new Date(2026, 9, 27, 7).toISOString() })], now)).toBe(3)
    expect(daysSinceStrength([ex({ started_at: new Date(2026, 9, 30, 7).toISOString() })], now)).toBe(0)
  })
  it('ignores other kinds and deleted sessions', () => {
    expect(daysSinceStrength([ex({ kind: 'cardio' }), ex({ deleted_at: 'x' })], now)).toBeNull()
  })
})

describe('trainingWarnings', () => {
  it('warns after 5 and 8 days without lifting', () => {
    expect(trainingWarnings({ exercisesToday: [], daysSinceStrength: 5, effectiveDeficit: 0.1, isRefeed: false })[0].level).toBe('yellow')
    expect(trainingWarnings({ exercisesToday: [], daysSinceStrength: 9, effectiveDeficit: 0.1, isRefeed: false })[0].level).toBe('red')
    expect(trainingWarnings({ exercisesToday: [], daysSinceStrength: 2, effectiveDeficit: 0.1, isRefeed: false })).toEqual([])
  })
  it('flags a hard session on a big deficit, but not on a refeed day', () => {
    const hard = [ex({ intensity: 'high' })]
    expect(trainingWarnings({ exercisesToday: hard, daysSinceStrength: 0, effectiveDeficit: 0.26, isRefeed: false })[0].text).toContain('26% deficit')
    expect(trainingWarnings({ exercisesToday: hard, daysSinceStrength: 0, effectiveDeficit: 0.26, isRefeed: true })).toEqual([])
  })
})
