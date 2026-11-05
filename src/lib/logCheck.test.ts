import { describe, expect, it } from 'vitest'
import type { LogEntry } from './foods'
import { entriesToCheck } from './logCheck'

const TODAY = '2026-11-05'
let id = 0
const log = (food_name: string, grams: number, kcal: number, daysAgo = 1, meta: LogEntry['meta'] = {}): LogEntry => ({
  id: String(id++), eaten_at: new Date(2026, 10, 5 - daysAgo, 12).toISOString(), meal: 'lunch', food_id: null, food_name, amount: grams, unit: 'g', grams, nutrients: { kcal }, meta, updated_at: '', deleted_at: null,
})
const check = (logs: LogEntry[]) => entriesToCheck(logs, {}, TODAY).map((f) => [f.entry.food_name, f.reason])

describe('entriesToCheck', () => {
  it('flags one entry at 500 kcal or more', () => {
    expect(check([log('Ribeye', 300, 500), log('Salad', 300, 499)])).toEqual([['Ribeye', 'calories']])
  })

  it('flags more than 5 times your usual amount, with what is usual', () => {
    const logs = [log('Almonds', 30, 170), log('Almonds', 28, 160), log('Almonds', 32, 180), log('Almonds', 200, 400)]
    const [flag] = entriesToCheck(logs, {}, TODAY)
    expect(flag).toMatchObject({ reason: 'usual', usualGrams: 30 })
    expect(flag.entry.grams).toBe(200)
  })

  it('needs 3 other logs to know what is usual', () => {
    expect(check([log('Almonds', 30, 170), log('Almonds', 30, 170), log('Almonds', 200, 400)])).toEqual([])
  })

  it('leaves out entries you said look right', () => {
    expect(check([log('Ribeye', 300, 700, 1, { looksRight: true })])).toEqual([])
  })

  it('only looks back 30 days, except for salt and pepper', () => {
    expect(check([log('Ribeye', 300, 700, 40), log('Black pepper', 100, 251, 40)])).toEqual([['Black pepper', 'seasoning']])
  })

  it('counts salt and pepper once', () => {
    expect(check([log('Black pepper', 300, 750)])).toEqual([['Black pepper', 'seasoning']])
  })

  it('lists newest first', () => {
    expect(check([log('Old', 300, 700, 5), log('New', 300, 700, 1)]).map(([n]) => n)).toEqual(['New', 'Old'])
  })
})
