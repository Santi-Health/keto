import { describe, expect, it } from 'vitest'
import type { Exercise, Lift } from './exercise'
import { EXERCISE_LIBRARY } from './library'
import { exercisesFor, groupsDue, hardCardioThisWeek, liftPlans, nextWeight, weekCoverage } from './training'

const session = (day: string, lifts: Partial<Lift>[]): Exercise => ({
  id: `${day}-${lifts[0]?.name}`,
  started_at: `${day}T18:00:00`,
  kind: 'strength',
  duration_min: 45,
  intensity: 'moderate',
  calories: 200,
  source: 'manual',
  external_id: null,
  note: null,
  meta: { lifts: lifts.map((l) => ({ name: '', weightLb: null, unit: 'lb', reps: null, sets: null, ...l })) },
  updated_at: '',
  deleted_at: null,
})

describe('weekly coverage', () => {
  const ex = [
    session('2026-11-10', [{ name: 'Plate-loaded chest press', weight: 95, reps: 7, sets: 4 }, { name: 'Goblet squat (kettlebell)', weight: 18, reps: 12, sets: 4 }]),
    session('2026-11-12', [{ name: 'Assisted pull-up', weight: 30, reps: 6, sets: 4, assisted: true }]),
  ]
  it('counts sets per group over 7 days', () => {
    const w = weekCoverage(ex, EXERCISE_LIBRARY, '2026-11-12')
    expect(w.find((g) => g.group === 'Chest')).toMatchObject({ sets: 4, target: 12, daysSince: 2 })
    expect(w.find((g) => g.group === 'Abs / core')).toMatchObject({ sets: 0, daysSince: null })
  })
  it('puts untrained abs first and skips what was trained yesterday or today', () => {
    const due = groupsDue(weekCoverage(ex, EXERCISE_LIBRARY, '2026-11-12')).map((g) => g.group)
    expect(due[0]).toBe('Abs / core')
    expect(due).not.toContain('Back')
  })
})

describe('progression', () => {
  const plan = (l: Partial<Lift>) => liftPlans([session('2026-11-12', [l])], EXERCISE_LIBRARY, '2026-11-12')[0]
  it('adds reps at the low end of the range', () => {
    expect(plan({ name: 'Plate-loaded chest press', weight: 95, reps: 7, sets: 4 }).next).toEqual({ weight: 95, reps: 8, change: 'reps' })
  })
  it('adds 5 lb and drops to the bottom of the range at the top', () => {
    const p = plan({ name: 'Plate-loaded chest press', weight: 95, reps: 10, sets: 4 })
    expect(p.next).toEqual({ weight: 100, reps: 6, change: 'weight' })
    expect(p.text).toMatch(/100 lb.*6 reps/)
  })
  it('takes assist away on assisted machines', () => {
    expect(plan({ name: 'Assisted pull-up', weight: 30, reps: 10, sets: 4, assisted: true }).next.weight).toBe(25)
  })
  it('uses reps per side when alternating and steps one kettlebell size', () => {
    const p = plan({ name: 'Double kettlebell split squat', weight: 16, unit: 'kg', reps: 20, sets: 2, bells: 2, side: 'both' })
    expect(p.next).toEqual({ weight: 20, reps: 12, change: 'weight' })
    expect(nextWeight({ name: 'Dumbbell curl', weight: 10, unit: 'kg' })).toBe(12.5)
  })
  it('flags 3 sessions at the same numbers', () => {
    const l = { name: 'Barbell bench press', weight: 135, reps: 8, sets: 3 }
    const ps = liftPlans([session('2026-11-05', [l]), session('2026-11-08', [l]), session('2026-11-11', [l])], EXERCISE_LIBRARY, '2026-11-12')
    expect(ps[0].stalled).toBe(true)
  })
})

describe('exercise picks', () => {
  const ex = [
    session('2026-11-01', [{ name: 'Decline sit-up / ab crunch', sets: 4, reps: 12, gym: 'MP2' }]),
    session('2026-11-10', [{ name: 'Decline sit-up / ab crunch', sets: 4, reps: 12, gym: 'MP2' }, { name: 'Elbow-to-knee crunch', sets: 2, reps: 18, gym: 'MP2' }]),
  ]
  it('puts what you have done first, most often first', () => {
    const p = exercisesFor('Abs / core', { exercises: ex, library: EXERCISE_LIBRARY, today: '2026-11-12' })
    expect(p.map((x) => x.name)).toEqual(['Decline sit-up / ab crunch', 'Elbow-to-knee crunch'])
    expect(p[0].times).toBe(2)
  })
  it('skips what you said you do not like and fills from your gym', () => {
    const p = exercisesFor('Abs / core', { exercises: ex, library: EXERCISE_LIBRARY, today: '2026-11-12', disliked: ['decline sit-up / ab crunch'], n: 3 })
    expect(p[0].name).toBe('Elbow-to-knee crunch')
    expect(p.slice(1).every((x) => x.times === 0 && x.atYourGym)).toBe(true)
  })
  it('offers list exercises for a group you have never trained', () => {
    const p = exercisesFor('Shoulders', { exercises: ex, library: EXERCISE_LIBRARY, today: '2026-11-12' })
    expect(p[0]).toMatchObject({ name: 'Overhead press (barbell)', times: 0, atYourGym: true })
  })
})

describe('timed lifts and cardio', () => {
  const plan = (l: Partial<Lift>) => liftPlans([session('2026-11-12', [l])], EXERCISE_LIBRARY, '2026-11-12')[0]
  it('builds holds by 5 s up to a minute, then asks for harder', () => {
    expect(plan({ name: 'Hollow hold', measure: 's', duration: 30, sets: 3 }).next.reps).toBe(35)
    expect(plan({ name: 'Hollow hold', measure: 's', duration: 60, sets: 3 }).text).toMatch(/harder/)
  })
  it('counts hold sets toward abs', () => {
    const w = weekCoverage([session('2026-11-12', [{ name: 'Hollow hold', measure: 's', duration: 30, sets: 3 }])], EXERCISE_LIBRARY, '2026-11-12')
    expect(w.find((g) => g.group === 'Abs / core')?.sets).toBe(3)
  })
  it('steps cardio up a level, and counts 10+ min toward VO2 max', () => {
    expect(plan({ name: 'StairMaster', measure: 'min', duration: 12, weight: 8, sets: 1 }).text).toMatch(/level 9/)
    const ex = [session('2026-11-12', [{ name: 'StairMaster', measure: 'min', duration: 12, sets: 1 }])]
    expect(hardCardioThisWeek(ex, '2026-11-12')).toBe(1)
    expect(hardCardioThisWeek([session('2026-11-12', [{ name: 'Row machine', measure: 'min', duration: 5, sets: 1 }])], '2026-11-12')).toBe(0)
  })
  it('two bells moved together keep every rep per arm', () => {
    const p = plan({ name: 'Double kettlebell split squat', weight: 16, unit: 'kg', reps: 10, sets: 2, bells: 2 })
    expect(p.next).toEqual({ weight: 20, reps: 6, change: 'weight' })
  })
})
