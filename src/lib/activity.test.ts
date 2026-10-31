import { describe, expect, it } from 'vitest'
import { averageBurn, mergeActivity, stableUuid, type ActivityDay } from './activity'
import { parseSleep, type ActivityImport } from './googleHealth'

const imp = (over: Partial<ActivityImport>): ActivityImport => ({ steps: {}, caloriesOut: {}, restingHr: {}, sleep: [], weights: [], bodyFat: [], skipped: [], ...over })

describe('activity import', () => {
  it('reads a Google Health sleep point', () => {
    const n = parseSleep({
      sleep: {
        interval: { startTime: '2026-10-30T05:30:00Z', endTime: '2026-10-30T13:30:00Z', civilEndTime: { date: { year: 2026, month: 10, day: 30 } } },
        summary: { minutesAsleep: '440', minutesInSleepPeriod: '480', stagesSummary: [{ type: 'DEEP', minutes: '70' }, { type: 'REM', minutes: '95' }] },
      },
    })!
    expect(n).toMatchObject({ day: '2026-10-30', asleepMin: 440, inBedMin: 480, stages: { DEEP: 70, REM: 95 } })
  })

  it('merges steps, burn, resting HR and sleep per day, and reports only changes', () => {
    const night = { day: '2026-10-30', start: 'a', end: 'b', asleepMin: 420, inBedMin: 450, stages: { DEEP: 60 } }
    const nap = { ...night, start: 'c', end: 'd', asleepMin: 30, inBedMin: 35, stages: {} }
    const days = mergeActivity(imp({ steps: { '2026-10-30': 9000 }, caloriesOut: { '2026-10-30': 2600 }, restingHr: { '2026-10-30': 54 }, sleep: [night, nap] }), {})
    expect(days).toHaveLength(1)
    expect(days[0]).toMatchObject({ steps: 9000, calories_out: 2600, resting_hr: 54, sleep_minutes: 450, meta: { deepMin: 60, inBedMin: 450 } })
    const again = mergeActivity(imp({ steps: { '2026-10-30': 9000 } }), { '2026-10-30': days[0] })
    expect(again).toHaveLength(0)
  })

  it('averages the last 7 full days of burn, skipping today and barely-worn days', () => {
    const d = (day: string, kcal: number): ActivityDay => ({ id: day, day, steps: null, calories_out: kcal, resting_hr: null, sleep_minutes: null, meta: {}, updated_at: '', deleted_at: null })
    const rows = [d('2026-10-27', 2500), d('2026-10-28', 2700), d('2026-10-29', 800), d('2026-10-30', 2600), d('2026-10-31', 1500)]
    expect(averageBurn(rows, '2026-10-31')).toEqual({ kcal: 2600, days: 3 })
    expect(averageBurn(rows.slice(0, 2), '2026-10-31')).toBeNull()
  })

  it('makes the same UUID for the same import key', async () => {
    const a = await stableUuid('fitbit-weight:x')
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(await stableUuid('fitbit-weight:x')).toBe(a)
  })
})
