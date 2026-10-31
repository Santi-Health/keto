import { describe, expect, it } from 'vitest'
import { mergeIntoDays, parseGlucosePoint, toReadings, type Reading } from './cgm'
import type { Exercise } from './exercise'
import type { LogEntry } from './foods'
import { exerciseEffects, foodImpacts, mealResponses, oddThings, summarize } from './glucoseInsights'

const day = '2026-10-30'
const at = (h: number, m = 0) => new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime()

/** Flat 90 mg/dL every 5 min, with bumps added on top. */
function series(bumps: { from: number; peakAt: number; to: number; rise: number }[] = []): Reading[] {
  const rs: Reading[] = []
  for (let t = at(0); t < at(23, 55); t += 5 * 60_000) {
    let v = 90
    for (const b of bumps) {
      if (t >= b.from && t <= b.peakAt) v += (b.rise * (t - b.from)) / (b.peakAt - b.from)
      else if (t > b.peakAt && t <= b.to) v += (b.rise * (b.to - t)) / (b.to - b.peakAt)
    }
    rs.push({ t, v: Math.round(v) })
  }
  return rs
}

const log = (h: number, m: number, name: string, netCarbs: number, meal: LogEntry['meal'] = 'lunch'): LogEntry => ({
  id: name,
  eaten_at: new Date(at(h, m)).toISOString(),
  meal,
  food_id: null,
  food_name: name,
  amount: 1,
  unit: 'g',
  grams: 100,
  nutrients: { netCarbs, protein: 20 },
  meta: {},
  updated_at: '',
  deleted_at: null,
})

describe('summarize', () => {
  it('reports average, time in range and the 3–6 AM value', () => {
    const s = summarize(series([{ from: at(13), peakAt: at(13, 45), to: at(15), rise: 70 }]))!
    expect(s.overnight).toBe(90)
    expect(s.inRangePct).toBeGreaterThan(90)
    expect(s.abovePct).toBeGreaterThan(0)
  })
})

describe('mealResponses', () => {
  it('measures the rise and peak time after a meal', () => {
    const rs = series([{ from: at(12, 10), peakAt: at(12, 55), to: at(14, 10), rise: 55 }])
    const [r] = mealResponses([log(12, 5, 'Salmon Sushi Roll', 35)], rs)
    expect(r.baseline).toBe(90)
    expect(r.rise).toBeGreaterThanOrEqual(50)
    expect(r.level).toBe('spike')
    expect(r.minutesToPeak).toBe(50)
    expect(foodImpacts([r])[0]).toMatchObject({ name: 'Salmon Sushi Roll', level: 'spike' })
  })
})

describe('oddThings', () => {
  it('flags an unexplained rise, explains dawn and exercise rises', () => {
    const run: Exercise = {
      id: 'r',
      started_at: new Date(at(17)).toISOString(),
      kind: 'cardio',
      duration_min: 30,
      intensity: 'high',
      calories: 300,
      source: 'fitbit',
      external_id: 'x',
      note: null,
      meta: {},
      updated_at: '',
      deleted_at: null,
    }
    const rs = series([
      { from: at(4, 30), peakAt: at(5, 10), to: at(6, 30), rise: 35 }, // dawn
      { from: at(15), peakAt: at(15, 30), to: at(16, 30), rise: 45 }, // no food logged
      { from: at(17, 5), peakAt: at(17, 30), to: at(18, 30), rise: 40 }, // during the run
    ])
    const kinds = oddThings(rs, [], [run], []).map((o) => o.kind)
    expect(kinds).toEqual(['dawn', 'unlogged', 'exercise'])
    expect(exerciseEffects([run], rs)[0].highest).toBeGreaterThan(120)
  })

  it('flags a big rise after a low-carb meal', () => {
    const rs = series([{ from: at(12, 10), peakAt: at(12, 50), to: at(14), rise: 45 }])
    const responses = mealResponses([log(12, 5, 'Chicken salad', 4)], rs)
    expect(oddThings(rs, [log(12, 5, 'Chicken salad', 4)], [], responses).map((o) => o.kind)).toContain('low_carb_spike')
  })
})

describe('CGM storage', () => {
  it('parses Google Health points and stores them per day by minute', () => {
    const p = parseGlucosePoint({ bloodGlucose: { bloodGlucoseMilligramsPerDeciliter: 101.4, sampleTime: { physicalTime: new Date(at(8, 5)).toISOString() } } })!
    expect(p.v).toBe(101.4)
    const [d] = mergeIntoDays([p, { t: at(8, 10), v: 104 }], {})
    expect(d.id).toBe(day)
    expect(d.points).toEqual([
      [485, 101],
      [490, 104],
    ])
    expect(toReadings([d])[1]).toEqual({ t: at(8, 10), v: 104 })
  })
})

describe('meals and workouts', () => {
  it('stops measuring a meal when a workout starts, so the run is not blamed on breakfast', () => {
    const run: Exercise = {
      id: 'r', started_at: new Date(at(8, 30)).toISOString(), kind: 'cardio', duration_min: 20, intensity: 'high',
      calories: 160, source: 'fitbit', external_id: 'x', note: null, meta: {}, updated_at: '', deleted_at: null,
    }
    const rs = series([{ from: at(8, 35), peakAt: at(8, 50), to: at(9, 30), rise: 30 }])
    const [r] = mealResponses([log(7, 0, 'Egg whites', 0, 'breakfast')], rs, [run])
    expect(r.cutByExercise).toBe(true)
    expect(r.rise).toBeLessThan(10)
  })
})
