import { describe, expect, it } from 'vitest'
import { buildCoach, topTips, type CoachInput } from './coach'
import type { DayEnergy } from './deficit'
import type { KetoEstimate } from './ketosis'

const keto = (mid: number, status: KetoEstimate['status']) => ({ low: mid, mid, high: mid, status, carbs24h: 15, unknownCarbItems: 0, reasons: [], populationMid: mid, features: {} as never, personalized: false }) as KetoEstimate
const week = (deficit: number, burned = 2600): DayEnergy[] =>
  Array.from({ length: 7 }, (_, i) => ({ day: `2026-11-0${i + 1}`, burned, eaten: burned - deficit, deficit, burnSource: 'fitbit' as const, logged: true }))
const base = (over: Partial<CoachInput> = {}): CoachInput => ({
  today: '2026-11-12',
  suggestions: [],
  proteinTargetG: 150,
  proteinTodayG: 150,
  netCarbLimitG: 25,
  muscleWarning: null,
  week: week(500),
  watch: [],
  ketoNow: keto(0.8, 'in'),
  ketoTomorrow: keto(0.8, 'in'),
  readiness: null,
  coverage: [
    { group: 'Chest', sets: 4, target: 12, daysSince: 2 },
    { group: 'Abs / core', sets: 0, target: 12, daysSince: null },
  ],
  due: [{ group: 'Abs / core', sets: 0, target: 12, daysSince: null }],
  plans: [],
  daysSinceStrength: 1,
  liftStreak: 0,
  hardCardio: 1,
  odd: [],
  spikeFoods: [],
  cgmDays: 3,
  scans: [],
  ...over,
})

describe('coach', () => {
  it('flags a deficit too big for muscle and says what it costs', () => {
    const t = buildCoach(base({ week: week(1000) })).find((x) => x.id === 'deficit-high')!
    expect(t.goal).toBe('muscle')
    expect(t.title).toMatch(/500 kcal more/)
    expect(t.tradeoff).toMatch(/fat faster.*muscle/)
  })
  it('is on pace at about 500 a day', () => {
    expect(buildCoach(base()).find((x) => x.id === 'deficit-ok')?.tone).toBe('good')
  })
  it('tells you to do core when the week had none', () => {
    const tips = buildCoach(base())
    expect(tips.find((x) => x.id === 'abs-core')).toMatchObject({ tone: 'warn', title: '12 more core sets this week' })
    expect(tips.find((x) => x.id === 'next-session')?.title).toMatch(/abs \/ core/)
  })
  it('keeps protein when ketosis drops', () => {
    const t = buildCoach(base({ ketoNow: keto(0.2, 'out') })).find((x) => x.id === 'keto-out')!
    expect(t.tradeoff).toMatch(/protein/)
  })
  it('ranks warnings first, then by goal priority', () => {
    const top = topTips(buildCoach(base({ week: week(1000), ketoNow: keto(0.2, 'out') })))
    expect(top[0].id).toBe('deficit-high')
    expect(top.map((t) => t.tone)).not.toContain('good')
  })
  it('estimates weeks to 12% from the last scan', () => {
    const scan = { totalMassKg: 150.2 * 0.45359237, bodyFatPct: 17, leanMassKg: 118.5 * 0.45359237, boneMassKg: 6.2 * 0.45359237 }
    const t = buildCoach(base({ scans: [{ date: '2026-11-05', scan }] })).find((x) => x.id === 'bodyfat')!
    expect(t.detail).toMatch(/About 8\.5 lb of fat/)
    expect(t.detail).toMatch(/9 weeks/)
  })
})
