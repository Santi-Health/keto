import { describe, expect, it } from 'vitest'
import type { DayEnergy } from './deficit'
import { planStatus, shiftDay } from './goalPlan'

const KG = 0.45359237
// Nov 5 DEXA: 150.2 lb, 25.5 lb fat, 118.5 lb lean, 6.2 lb bone, 17.0%.
const scan = { date: '2026-11-05', scan: { totalMassKg: 150.2 * KG, fatMassKg: 25.5 * KG, leanMassKg: 118.5 * KG, boneMassKg: 6.2 * KG, bodyFatPct: 17 } }
const days = (from: string, n: number, deficit: number): DayEnergy[] =>
  Array.from({ length: n }, (_, i) => ({ day: shiftDay(from, i), burned: 2600, eaten: 2600 - deficit, deficit, burnSource: 'fitbit' as const, logged: true }))
const plan = { start: '2026-11-14', weeks: 12, targetBfPct: 12 }

describe('12-week plan', () => {
  it('sets the goal from the scan, holding lean mass', () => {
    const p = planStatus({ plan, today: '2026-11-14', scan, energy: [], weights: [] })!
    expect(p.goalWeightLb).toBeCloseTo(141.7, 1)
    expect(p.toLoseLb).toBeCloseTo(8.5, 1)
    expect(p.dailyDeficit).toBe(354)
    expect(p.weeks[11].targetBfPct).toBe(12)
    expect(p.week).toBe(1)
  })
  it('starts from the scan less what the deficit burned before the plan', () => {
    const p = planStatus({ plan, today: '2026-11-14', scan, energy: days('2026-11-05', 9, 500), weights: [] })!
    expect(p.startFatLb).toBeCloseTo(25.5 - 9 * 500 / 3500, 1)
  })
  it('tracks the deficit, the scale and predicts the end', () => {
    const energy = days('2026-11-14', 21, 500)
    const weights = [{ day: '2026-12-02', kg: 146.5 * KG }, { day: '2026-12-04', kg: 146.1 * KG }]
    const p = planStatus({ plan, today: '2026-12-05', scan, energy, weights })!
    expect(p.week).toBe(4)
    expect(p.lostByDeficitLb).toBe(3)
    expect(p.lostByScaleLb).toBeCloseTo(150.2 - 146.3, 0)
    expect(p.aheadLb).toBeGreaterThan(0)
    expect(p.predictedBfPct!).toBeLessThan(12)
    expect(p.weeks[2].weighInLb).toBeCloseTo(146.3, 1)
    expect(p.weeks.slice(0, 4).map((w) => w.state)).toEqual(['done', 'done', 'done', 'now'])
    expect(p.weeks[0].onTrack).toBe(true)
    expect(p.weeks[4].actualFatLb).toBeNull()
  })
  it('says how far behind a slow pace is', () => {
    const p = planStatus({ plan, today: '2026-12-05', scan, energy: days('2026-11-14', 21, 150), weights: [] })!
    expect(p.aheadLb).toBeLessThan(0)
    expect(p.predictedBfPct!).toBeGreaterThan(12)
    expect(p.weeksToGoal!).toBeGreaterThan(9)
    expect(p.weeks[0].onTrack).toBe(false)
  })
  it('blends the scale in, up to half with 4+ weigh-ins in the last 7 days', () => {
    const energy = days('2026-11-14', 21, 500)
    const none = planStatus({ plan, today: '2026-12-05', scan, energy, weights: [] })!
    expect(none.scaleWeight).toBe(0)
    expect(none.lostLb).toBe(none.lostByDeficitLb)
    // Scale says 1 lb lost; deficit says 3.
    const two = [{ day: '2026-12-02', kg: 149.2 * KG }, { day: '2026-12-04', kg: 149.2 * KG }]
    const p2 = planStatus({ plan, today: '2026-12-05', scan, energy, weights: two })!
    expect(p2.scaleWeight).toBe(0.25)
    const four = ['2026-11-30', '2026-12-01', '2026-12-03', '2026-12-04'].map((day) => ({ day, kg: 149.2 * KG }))
    const p4 = planStatus({ plan, today: '2026-12-05', scan, energy, weights: four })!
    expect(p4.scaleWeight).toBe(0.5)
    expect(p4.lostLb).toBeCloseTo((p4.lostByDeficitLb + p4.lostByScaleLb!) / 2, 1)
    expect(p4.lostLb).toBeLessThan(p2.lostLb)
    expect(p4.aheadLb).toBeLessThan(none.aheadLb)
  })
  it("lets a week's own weigh-ins pull its check", () => {
    const energy = days('2026-11-14', 21, 500)
    // Week 3 (Nov 28 – Dec 4): scale shows no loss at all, four times.
    const flat = ['2026-11-28', '2026-11-30', '2026-12-02', '2026-12-04'].map((day) => ({ day, kg: 150.2 * KG }))
    const p = planStatus({ plan, today: '2026-12-05', scan, energy, weights: flat })!
    const plain = planStatus({ plan, today: '2026-12-05', scan, energy, weights: [] })!
    expect(p.weeks[2].actualFatLb!).toBeGreaterThan(plain.weeks[2].actualFatLb!)
    expect(p.weeks[0].actualFatLb).toBe(plain.weeks[0].actualFatLb)
  })
})
