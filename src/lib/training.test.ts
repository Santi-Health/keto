import { describe, expect, it } from 'vitest'
import type { Exercise, Lift } from './exercise'
import { EXERCISE_LIBRARY, setCredit } from './library'
import { daysLeftInWeek, exercisesFor, groupsDue, hardCardioThisWeek, liftPlans, nextWeight, pastWeeks, progressionScore, progressSinceStart, suggestFromHistory, weekCoverage, weekStart } from './training'

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
  it('puts the most effective first, then what you have done', () => {
    const p = exercisesFor('Abs / core', { exercises: ex, library: EXERCISE_LIBRARY, today: '2026-11-12', n: 4 })
    expect(p[0]).toMatchObject({ name: 'Decline sit-up / ab crunch', credit: 1, times: 2 })
    expect(p.map((x) => x.credit)).toEqual([...p.map((x) => x.credit)].sort((a, b) => b - a))
    expect(p.find((x) => x.name === 'Elbow-to-knee crunch')).toBeUndefined()
  })
  it('skips what you said you do not like', () => {
    const p = exercisesFor('Abs / core', { exercises: ex, library: EXERCISE_LIBRARY, today: '2026-11-12', disliked: ['decline sit-up / ab crunch'], n: 3 })
    expect(p.map((x) => x.name)).not.toContain('Decline sit-up / ab crunch')
    expect(p[0].credit).toBe(0.9)
  })
  it('offers list exercises for a group you have never trained', () => {
    const p = exercisesFor('Shoulders', { exercises: ex, library: EXERCISE_LIBRARY, today: '2026-11-12' })
    expect(p[0]).toMatchObject({ name: 'Seated dumbbell shoulder press', times: 0, atYourGym: true })
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
    // A hollow hold is light core: each set counts 0.6.
    expect(w.find((g) => g.group === 'Abs / core')?.sets).toBe(1.8)
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

describe('Monday to Sunday week', () => {
  const ex = [session('2026-11-14', [{ name: 'Plate-loaded chest press', weight: 95, reps: 8, sets: 4 }])]
  it('starts on Monday and counts through Sunday', () => {
    expect(weekStart('2026-11-12')).toBe('2026-11-09')
    expect(weekStart('2026-11-15')).toBe('2026-11-09')
    expect(weekStart('2026-11-16')).toBe('2026-11-16')
    expect(daysLeftInWeek('2026-11-14')).toBe(1)
    expect(daysLeftInWeek('2026-11-15')).toBe(0)
  })
  it('bars roll over the last 7 days; a fixed week counts from its Monday', () => {
    expect(weekCoverage(ex, EXERCISE_LIBRARY, '2026-11-16').find((g) => g.group === 'Chest')?.sets).toBe(4)
    expect(weekCoverage(ex, EXERCISE_LIBRARY, '2026-11-16', '2026-11-16').find((g) => g.group === 'Chest')?.sets).toBe(0)
    expect(weekCoverage(ex, EXERCISE_LIBRARY, '2026-11-21').find((g) => g.group === 'Chest')?.sets).toBe(0)
  })
})

describe('past weeks', () => {
  const full = Object.entries({ 'Plate-loaded chest press': 12, 'Decline sit-up / ab crunch': 12, 'Assisted pull-up': 10, 'Barbell back squat': 10, 'Seated leg curl': 6, 'Overhead press (barbell)': 6, 'Dumbbell curl': 6 })
  it('judges each full week, newest first, and counts sets capped at their target', () => {
    const ex = [
      session('2026-11-04', full.map(([name, sets]) => ({ name, reps: 8, sets }))),
      // The week before had fewer reps, so the test week counts as progress (full credit).
      session('2026-10-28', [{ name: 'Plate-loaded chest press', reps: 6, sets: 20 }]),
    ]
    const [last, before] = pastWeeks(ex, EXERCISE_LIBRARY, '2026-11-12', 2)
    expect(last).toMatchObject({ start: '2026-11-02', end: '2026-11-08', verdict: 'good', groupsMet: 7 })
    expect(before).toMatchObject({ start: '2026-10-26', verdict: 'behind', groupsMet: 1, sets: 12 })
  })
  it('starts at the week of your first logged lift', () => {
    const ex = [session('2026-11-04', [{ name: 'Plate-loaded chest press', reps: 8, sets: 4 }])]
    expect(pastWeeks(ex, EXERCISE_LIBRARY, '2026-11-26', 6).map((w) => w.start)).toEqual(['2026-11-16', '2026-11-09', '2026-11-02'])
    expect(pastWeeks([], EXERCISE_LIBRARY, '2026-11-26')).toEqual([])
  })
  it('calls 5 of 7 groups close', () => {
    const ex = [session('2026-11-04', full.slice(0, 5).map(([name, sets]) => ({ name, reps: 8, sets })))]
    expect(pastWeeks(ex, EXERCISE_LIBRARY, '2026-11-12', 1)[0].verdict).toBe('close')
  })
})

describe('prefill from last time', () => {
  const ex = [
    session('2026-11-05', [{ name: 'Plate-loaded chest press', weight: 90, reps: 10, sets: 4 }]),
    session('2026-11-12', [{ name: 'Plate-loaded chest press', weight: 95, reps: 10, sets: 4 }]),
  ]
  it('suggests the next step and the change from last time', () => {
    const s = suggestFromHistory('plate-loaded chest press', ex, EXERCISE_LIBRARY)!
    expect(s.last).toMatchObject({ day: '2026-11-12', weight: 95, reps: 10, sets: 4 })
    expect(s.fill).toMatchObject({ weight: 100, reps: 6, sets: 4, unit: 'lb' })
    expect(s.delta).toEqual({ weight: 5, amount: -4 })
  })
  it('ignores the session being edited and returns null for something new', () => {
    expect(suggestFromHistory('Plate-loaded chest press', ex, EXERCISE_LIBRARY, ex[1].id)!.last.weight).toBe(90)
    expect(suggestFromHistory('Hollow hold', ex, EXERCISE_LIBRARY)).toBeNull()
  })
  it('adds reps at the same weight below the top of the range', () => {
    const s = suggestFromHistory('Assisted pull-up', [session('2026-11-12', [{ name: 'Assisted pull-up', weight: 30, reps: 6, sets: 4, assisted: true }])], EXERCISE_LIBRARY)!
    expect(s.fill).toMatchObject({ weight: 30, reps: 7, assisted: true })
    expect(s.delta).toEqual({ weight: 0, amount: 1 })
  })
})

describe('exercise score: tier × progression', () => {
  const L = (l: Partial<Lift>): Lift => ({ name: 'Dumbbell curl', weightLb: null, weight: 15, unit: 'lb', reps: 12, sets: 4, ...l })
  const p = (l: Partial<Lift>, prev: Partial<Lift>[]) => progressionScore(L(l), prev.map(L), EXERCISE_LIBRARY)
  it('fewer reps at the same weight count less (your curl example)', () => {
    expect(p({ reps: 10, sets: 3 }, [{}]).effort).toBe(0.83)
    const ex = [session('2026-11-09', [L({})]), session('2026-11-12', [L({ reps: 10, sets: 3 })])]
    expect(weekCoverage(ex, EXERCISE_LIBRARY, '2026-11-12', '2026-11-12').find((g) => g.group === 'Arms')?.sets).toBe(2.5)
  })
  it('a bit harder counts in full; repeating counts 0.9, then 0.8 on the third time', () => {
    expect(p({ reps: 13 }, [{}]).effort).toBe(1)
    expect(p({}, []).effort).toBe(1)
    expect(p({}, [{}]).effort).toBe(0.9)
    expect(p({}, [{}, {}]).effort).toBe(0.8)
  })
  it('the planned step up in weight counts in full when it reaches the bottom of the range', () => {
    expect(p({ weight: 20, reps: 10 }, [{ weight: 15, reps: 15 }]).effort).toBe(1)
    expect(p({ weight: 20, reps: 5 }, [{ weight: 15, reps: 15 }]).effort).toBe(0.5)
  })
  it('lighter never gets full credit; holds compare seconds', () => {
    expect(p({ weight: 10 }, [{}]).effort).toBe(0.67)
    expect(p({ weight: 10, reps: 20 }, [{}]).effort).toBe(0.85)
    expect(p({ name: 'Hollow hold', measure: 's', duration: 30, reps: null, weight: null }, [{ name: 'Hollow hold', measure: 's', duration: 40, reps: null, weight: null }]).effort).toBe(0.75)
  })
  it('more assist on an assisted machine counts as lighter', () => {
    const a = (assist: number, reps: number): Partial<Lift> => ({ name: 'Assisted pull-up', assisted: true, weight: assist, reps })
    expect(p(a(40, 8), [a(30, 8)]).effort).toBe(0.85)
    expect(p(a(25, 6), [a(30, 10)]).effort).toBe(1)
  })
  it('tiers: the best lifts count 1, light core 0.6, your own additions 0.75', () => {
    expect(setCredit('Barbell bench press', EXERCISE_LIBRARY)).toBe(1)
    expect(setCredit('Elbow-to-knee crunch', EXERCISE_LIBRARY)).toBe(0.6)
    expect(setCredit('Farmer carry', EXERCISE_LIBRARY)).toBe(0.75)
  })
  it('shows progress since your first session', () => {
    expect(progressSinceStart([L({ weight: 15, reps: 12 }), L({ weight: 20, reps: 10 })], ['2026-11-09', '2026-11-30'])).toEqual({ pct: 27, since: '2026-11-09' })
  })
})
