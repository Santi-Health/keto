import { describe, expect, it } from 'vitest'
import type { Exercise } from './exercise'
import { classifyExercise, mergeImported, toAppExercise, type HealthExercise } from './googleHealth'

const point = (type: string, start: string, minutes: number, kcal: number, extra: Partial<NonNullable<HealthExercise['exercise']>['metricsSummary']> = {}): HealthExercise => ({
  name: `users/1/dataTypes/exercise/dataPoints/${type}-${start}`,
  exercise: {
    interval: { startTime: start, endTime: new Date(Date.parse(start) + minutes * 60_000).toISOString() },
    exerciseType: type,
    displayName: type,
    activeDuration: `${minutes * 60}s`,
    metricsSummary: { caloriesKcal: kcal, ...extra },
  },
})

describe('classifyExercise', () => {
  it('maps Fitbit types to yoga, running, StairMaster and strength', () => {
    expect(classifyExercise('YOGA')).toEqual({ kind: 'mobility' })
    expect(classifyExercise('RUNNING')).toEqual({ kind: 'cardio', cardioType: 'running' })
    expect(classifyExercise('STAIR_CLIMBING_MACHINE')).toEqual({ kind: 'cardio', cardioType: 'stairmaster' })
    expect(classifyExercise('WEIGHTLIFTING')).toEqual({ kind: 'strength' })
    expect(classifyExercise('EXERCISE', 'Stairmaster')).toEqual({ kind: 'cardio', cardioType: 'stairmaster' })
  })
})

describe('toAppExercise', () => {
  it('converts distance, duration and subtracts resting calories', () => {
    const e = toAppExercise(point('RUNNING', '2026-10-30T13:00:00Z', 30, 400, { distanceMillimiters: 5_000_000 }), 68, 1557)!
    expect(e.kind).toBe('cardio')
    expect(e.meta.cardioType).toBe('running')
    expect(e.duration_min).toBe(30)
    expect(e.meta.distanceMi).toBeCloseTo(3.11, 2)
    // 400 − 1557/1440 × 30 ≈ 368 active kcal
    expect(e.calories).toBe(368)
    expect(e.intensity).toBe('high')
    expect(e.source).toBe('fitbit')
  })
})

describe('mergeImported', () => {
  const manualYoga: Exercise = {
    id: 'm1',
    started_at: '2026-10-30T19:05:00Z',
    kind: 'mobility',
    duration_min: 50,
    intensity: 'moderate',
    calories: 130,
    source: 'manual',
    external_id: null,
    note: 'felt good',
    meta: { yogaStyle: 'power', fasted: true, caloriesEstimated: true },
    updated_at: '',
    deleted_at: null,
  }
  const yoga = toAppExercise(point('YOGA', '2026-10-30T19:10:00Z', 48, 210), 68, 1557)!
  const run = toAppExercise(point('RUNNING', '2026-10-30T13:00:00Z', 30, 400), 68, 1557)!

  it('fills in a matching manual session instead of adding a duplicate', () => {
    const r = mergeImported([yoga, run], [manualYoga])
    expect(r.matched).toHaveLength(1)
    expect(r.matched[0].id).toBe('m1')
    expect(r.matched[0].duration_min).toBe(48)
    expect(r.matched[0].meta.yogaStyle).toBe('power') // keeps what you set
    expect(r.matched[0].meta.fasted).toBe(true)
    expect(r.added).toHaveLength(1)
    expect(r.added[0].meta.cardioType).toBe('running')
  })

  it('updates instead of re-adding on a second import', () => {
    const first = mergeImported([run], [])
    const again = mergeImported([run], first.added)
    expect(again.added).toHaveLength(0)
    expect(again.updated).toHaveLength(1)
  })
})
