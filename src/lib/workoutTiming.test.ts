import { describe, expect, it } from 'vitest'
import { fitbitStatus, startFromHeartRate, strengthMinutes, type Exercise, type Lift } from './exercise'
import { mergeImported } from './googleHealth'

const lift = (l: Partial<Lift>): Lift => ({ name: 'x', weightLb: null, reps: 8, sets: 4, ...l })

describe('workout length from what was logged', () => {
  it('counts 5 minutes per 4 sets plus timed pieces', () => {
    expect(strengthMinutes([lift({ sets: 4 }), lift({ sets: 4 }), lift({ sets: 4 }), lift({ sets: 4 })])).toBe(20)
    expect(strengthMinutes([lift({ sets: 4 }), lift({ measure: 'min', duration: 12, sets: 1, reps: null })])).toBe(17)
    expect(strengthMinutes([lift({ sets: 2 })])).toBe(10)
  })
})

describe('start from heart rate', () => {
  const end = Date.parse('2026-11-16T19:00:00')
  const at = (minBefore: number, bpm: number) => ({ t: end - minBefore * 60_000, bpm })
  it('walks back through the raised heart rate, across rests between sets', () => {
    const hr = [at(80, 62), at(70, 64), at(55, 66), at(50, 105), at(45, 118), at(38, 70), at(33, 112), at(20, 120), at(10, 99), at(2, 110)]
    expect(startFromHeartRate(hr, end, 58)).toBe(end - 50 * 60_000)
  })
  it('gives up when Fitbit has not synced the end yet or shows no workout', () => {
    expect(startFromHeartRate([at(40, 120), at(30, 118)], end, 58)).toBeNull()
    expect(startFromHeartRate([at(20, 62), at(5, 63)], end, 58)).toBeNull()
  })
})

describe('calories only from Fitbit', () => {
  const now = Date.parse('2026-11-16T20:00:00')
  const ex = (over: Partial<Exercise> = {}): Exercise => ({
    id: 'm1',
    started_at: '2026-11-16T18:10:00.000Z',
    kind: 'strength',
    duration_min: 45,
    intensity: 'moderate',
    calories: null,
    source: 'manual',
    external_id: null,
    note: null,
    meta: { awaitingFitbit: true, lifts: [lift({ name: 'Chest press (Matrix)' })] },
    updated_at: '',
    deleted_at: null,
    ...over,
  })
  it('waits, then flags a workout Fitbit never recorded', () => {
    expect(fitbitStatus(ex(), Date.parse('2026-11-16T19:30:00Z'))).toBe('waiting')
    expect(fitbitStatus(ex(), Date.parse('2026-11-17T09:00:00Z'))).toBe('missing')
    expect(fitbitStatus(ex({ calories: 210 }), now)).toBe('ok')
  })
  it("takes Fitbit's calories and start when its recording overlaps the logged workout", () => {
    const fitbit = { ...ex(), started_at: '2026-11-16T17:20:00.000Z', duration_min: 70, calories: 260, source: 'fitbit' as const, external_id: 'f1', meta: { fitbitType: 'STRENGTH_TRAINING' } }
    const { matched } = mergeImported([fitbit], [ex()])
    expect(matched[0]).toMatchObject({ id: 'm1', calories: 260, started_at: '2026-11-16T17:20:00.000Z', duration_min: 70 })
    expect(matched[0].meta.awaitingFitbit).toBeUndefined()
    expect(matched[0].meta.lifts?.[0].name).toBe('Chest press (Matrix)')
  })
})
