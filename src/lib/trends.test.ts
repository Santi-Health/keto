import { describe, expect, it } from 'vitest'
import type { LogEntry } from './foods'
import type { ReadingRow } from './readings'
import { dailySeries, lastDays, summarizeRange } from './trends'
import { csvFiles, toCsv } from './exportData'

const at = (day: string, h: number) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).toISOString()
const log = (day: string, netCarbs: number, kcal: number): LogEntry => ({
  id: day + kcal, eaten_at: at(day, 12), meal: 'lunch', food_id: null, food_name: 'x', amount: 1, unit: 'g', grams: 100,
  nutrients: { netCarbs, kcal, protein: 120 }, meta: {}, updated_at: '', deleted_at: null,
})
const reading = (day: string, kind: ReadingRow['kind'], value: number, context: ReadingRow['context'] = 'other'): ReadingRow => ({
  id: day + kind + value, taken_at: at(day, 7), kind, value, urine_level: null, context, note: null, predicted_value: kind === 'blood_ketone' ? 0.6 : null,
  unit: null, meta: {}, updated_at: '', deleted_at: null,
})

describe('trends', () => {
  it('lists the last n days ending on a date', () => {
    expect(lastDays(3, '2026-11-01')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01'])
  })

  it('builds daily points and averages intake over logged days only', () => {
    const days = lastDays(3, '2026-10-31')
    const pts = dailySeries({
      days,
      logs: [log('2026-10-29', 20, 1800), log('2026-10-31', 40, 2200)],
      readings: [reading('2026-10-29', 'weight', 68), reading('2026-10-31', 'weight', 67.5), reading('2026-10-31', 'blood_ketone', 0.8), reading('2026-10-30', 'glucose', 98, 'fasted')],
      exercises: [],
      activity: {},
      cgmDays: {},
    })
    expect(pts.map((p) => p.logged)).toEqual([true, false, true])
    expect(pts[2]).toMatchObject({ ketones: 0.8, ketonesPredicted: 0.6, weightKg: 67.5 })
    expect(pts[1].fastingGlucose).toBe(98)
    const s = summarizeRange(pts, [reading('2026-10-31', 'blood_ketone', 0.8)], 25)
    expect(s).toMatchObject({ loggedDays: 2, kcal: 2000, netCarbs: 30, daysUnderCarbLimit: 1, weightStartKg: 68, weightEndKg: 67.5, ketoneReadings: 1, daysInKetosis: 1 })
  })
})

describe('export', () => {
  it('quotes CSV cells that need it', () => {
    expect(toCsv(['a', 'b'], [['x, y', 'say "hi"'], [null, 3]])).toBe('a,b\n"x, y","say ""hi"""\n,3\n')
  })

  it('makes one CSV per kind of data', () => {
    const files = csvFiles({ exportedAt: '', profile: {} as never, foods: [], foodLogs: [log('2026-10-31', 4, 300)], savedMeals: [], exercises: [], readings: [], activity: [], cgmDays: [] })
    expect(Object.keys(files)).toEqual(['food-log.csv', 'readings.csv', 'exercise.csv', 'activity.csv', 'glucose-cgm.csv'])
    expect(files['food-log.csv'].split('\n')[1]).toMatch(/^2026-10-31 12:00,lunch,x,1,g,100,300,4,/)
  })
})
