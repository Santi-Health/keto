import { describe, expect, it } from 'vitest'
import { mergeIntoDays, toReadings, type CgmDay } from './cgm'
import { dayHours, dayIn, entryDay, midnightIn, wallTimeToUtc } from './time'

const LA = 'America/Los_Angeles'
const NY = 'America/New_York'

describe('daylight saving days', () => {
  it('knows Nov 1, 2026 has 25 hours and Mar 14, 2027 has 23 in California', () => {
    expect(dayHours(LA, '2026-10-31')).toBe(24)
    expect(dayHours(LA, '2026-11-01')).toBe(25)
    expect(dayHours(LA, '2027-03-14')).toBe(23)
    expect(midnightIn(LA, '2026-11-01')).toBe(Date.parse('2026-11-01T07:00:00Z')) // still PDT at midnight
    expect(midnightIn(LA, '2026-11-02')).toBe(Date.parse('2026-11-02T08:00:00Z')) // PST afterwards
    expect(wallTimeToUtc(LA, '2026-11-01', 6 * 60)).toBe(Date.parse('2026-11-01T14:00:00Z')) // 6 AM PST
  })

  it('keeps every glucose reading through the repeated 1 AM hour when clocks fall back', () => {
    const start = Date.parse('2026-11-01T07:00:00Z') // local midnight
    const readings = Array.from({ length: 48 }, (_, i) => ({ t: start + i * 5 * 60_000, v: 100 + i })) // 4 real hours
    const [day] = mergeIntoDays(readings, {}, LA)
    expect(day.id).toBe('2026-11-01')
    expect(day.points).toHaveLength(48) // nothing overwritten
    expect(toReadings([day])).toEqual(readings)
  })

  it('keeps times right after the clocks jump forward in March', () => {
    const start = midnightIn(LA, '2027-03-14')
    const readings = Array.from({ length: 36 }, (_, i) => ({ t: start + i * 5 * 60_000, v: 90 }))
    const [day] = mergeIntoDays(readings, {}, LA)
    expect(toReadings([day]).map((r) => r.t)).toEqual(readings.map((r) => r.t))
    // 3 real hours after midnight is 4 AM on the clock.
    expect(new Date(start + 3 * 3_600_000).toLocaleTimeString('en-US', { timeZone: LA, hour: 'numeric' })).toBe('4 AM')
  })

  it('converts older glucose days (wall-clock minutes) when new readings arrive', () => {
    const legacy: CgmDay = { id: '2026-10-30', day: '2026-10-30', points: [[485, 101]], source: 'google_health', meta: {}, updated_at: '', deleted_at: null }
    const t = new Date('2026-10-30T08:10:00').getTime()
    const [day] = mergeIntoDays([{ t, v: 104 }], { '2026-10-30': legacy })
    expect(day.points).toEqual([
      [485, 101],
      [490, 104],
    ])
    expect(day.meta.startMs).toBe(new Date('2026-10-30T00:00:00').getTime())
  })
})

describe('travel', () => {
  it('counts an entry on the day it happened where it was logged', () => {
    // 10 PM dinner in California is already 1 AM the next day in New York.
    const dinner = '2026-10-31T05:00:00Z'
    expect(entryDay(dinner, LA)).toBe('2026-10-30')
    expect(entryDay(dinner, NY)).toBe('2026-10-31')
    expect(dayIn(NY, Date.parse(dinner))).toBe('2026-10-31')
  })
})
