import { describe, expect, it } from 'vitest'
import { DEFAULT_YOGA_ROUTINE, daysSinceStrength, estimateExerciseKcal, pace, routineDue, speed, trainingWarnings, type Exercise } from './exercise'

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

describe('detailed estimates', () => {
  it('uses running speed from distance and time', () => {
    // 3 mi in 30 min = 6 mph → MET ≈ 9.75; (9.75 − 1) × 68 × 0.5 ≈ 298
    expect(estimateExerciseKcal('cardio', 'moderate', 30, 68, { cardioType: 'running', distanceMi: 3 })).toBe(298)
    expect(pace(3, 28.5)).toBe('9:30 /mi')
  })
  it('uses cycling speed when the distance is known, effort otherwise', () => {
    // 14 mi in 60 min = 14 mph → MET 10; (10 − 1) × 68 × 1 = 612
    expect(estimateExerciseKcal('cardio', 'moderate', 60, 68, { cardioType: 'cycling', distanceMi: 14 })).toBe(612)
    // Moderate without distance → 6.8; (6.8 − 1) × 68 × 0.5 ≈ 197
    expect(estimateExerciseKcal('cardio', 'moderate', 30, 68, { cardioType: 'cycling' })).toBe(197)
    expect(speed(14, 60)).toBe('14 mph')
  })
  it('uses StairMaster and yoga style values', () => {
    expect(estimateExerciseKcal('cardio', 'moderate', 30, 68, { cardioType: 'stairmaster' })).toBe(272)
    expect(estimateExerciseKcal('mobility', 'moderate', 50, 68, { yogaStyle: 'flow' })).toBe(130)
  })
})

describe('routineDue', () => {
  it('is due on Mon/Wed/Fri until yoga is logged', () => {
    const wed = new Date(2026, 9, 28, 9)
    const thu = new Date(2026, 9, 29, 9)
    expect(routineDue(DEFAULT_YOGA_ROUTINE, [], wed)).toBe(true)
    expect(routineDue(DEFAULT_YOGA_ROUTINE, [ex({ kind: 'mobility' })], wed)).toBe(false)
    expect(routineDue(DEFAULT_YOGA_ROUTINE, [], thu)).toBe(false)
  })
})
