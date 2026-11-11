import { describe, expect, it } from 'vitest'
import { dayEnergy, deficitSoFar } from './deficit'
import type { Exercise } from './exercise'

const at = (h: number, m = 0) => new Date(2026, 9, 31, h, m)
const log = (h: number, kcal: number) => ({ eaten_at: at(h).toISOString(), nutrients: { kcal } })
const ride = (h: number, minutes: number, calories: number) =>
  ({ started_at: at(h).toISOString(), duration_min: minutes, calories, deleted_at: null }) as Exercise

describe('deficit so far today', () => {
  // BMR 1,440 × 1.2 → 1.2 kcal a minute, 72 an hour.
  const base = { day: '2026-10-31', bmr: 1440 }

  it('counts resting burn for the time passed plus workouts, minus food', () => {
    const d = deficitSoFar({ ...base, now: at(15), logs: [log(8, 400), log(12, 300)], exercises: [ride(13, 60, 500)] })
    expect(d.burned).toBe(15 * 72 + 500)
    expect(d.eaten).toBe(700)
    expect(d.deficit).toBe(15 * 72 + 500 - 700)
    expect(d.burnSource).toBe('estimate')
    // Hour by hour: at the end of 8 AM breakfast is in, the ride isn't yet.
    expect(d.hours[8]).toMatchObject({ burned: 9 * 72, eaten: 400 })
    expect(d.hours).toHaveLength(15)
    // Resting 1 kcal a minute, the everyday 20% on top, and the ride.
    expect(d.parts.resting).toBe(15 * 60)
    expect(d.parts.movement).toBe(15 * 12)
    expect(d.parts.workouts.map((w) => w.kcal)).toEqual([500])
    // Nothing more eaten: another 9 hours of resting burn by midnight.
    expect(d.byMidnight).toBe(d.deficit + 9 * 72)
  })

  it('counts only the part of a workout done so far', () => {
    const d = deficitSoFar({ ...base, now: at(13, 30), logs: [], exercises: [ride(13, 60, 500)] })
    expect(d.burned).toBe(Math.round(13.5 * 72 + 250))
  })

  it("uses Fitbit's total up to the import, then estimates from there", () => {
    const activity = { calories_out: 1500, updated_at: at(12).toISOString() }
    const d = deficitSoFar({ ...base, now: at(14), logs: [log(9, 600)], exercises: [ride(10, 60, 400), ride(13, 30, 200)], activity })
    // Fitbit already includes the 10 AM ride; the 1 PM one comes after the import.
    expect(d.burned).toBe(1500 + 2 * 72 + 200)
    expect(d.burnSource).toBe('fitbit')
    expect(d.hours[11].burned).toBe(1500)
    // Fitbit's extra beyond resting and workouts is everyday movement.
    expect(d.parts.resting + d.parts.movement + d.parts.workouts.reduce((s, w) => s + w.kcal, 0)).toBe(d.burned)
  })

  it("ignores Fitbit's number from before today", () => {
    const activity = { calories_out: 2400, updated_at: new Date(2026, 9, 30, 22).toISOString() }
    expect(deficitSoFar({ ...base, now: at(6), logs: [], exercises: [], activity }).burnSource).toBe('estimate')
  })
})

describe('dayEnergy', () => {
  const food = (iso: string, kcal: number) => ({ eaten_at: iso, nutrients: { kcal } as never })
  it('uses Fitbit’s full-day total when it was imported after the day ended', () => {
    const e = dayEnergy({ day: '2026-11-10', bmr: 1600, logs: [food('2026-11-10T12:00:00', 1800)], exercises: [], activity: { calories_out: 2600, updated_at: '2026-11-11T08:00:00' } })
    expect(e).toMatchObject({ burned: 2600, eaten: 1800, deficit: 800, burnSource: 'fitbit', logged: true })
  })
  it('estimates the whole day without Fitbit, and a surplus is negative', () => {
    const e = dayEnergy({ day: '2026-11-10', bmr: 1500, logs: [food('2026-11-10T12:00:00', 2000)], exercises: [], activity: null })
    expect(e.burned).toBe(1800)
    expect(e.deficit).toBe(-200)
    expect(e.burnSource).toBe('estimate')
  })
})
