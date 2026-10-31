import { describe, expect, it } from 'vitest'
import { parseScanJson, recompSummary, scanChanges } from './bodyScan'
import { KG_PER_LB } from './readings'

const lb = (x: number) => x * KG_PER_LB

describe('body scans', () => {
  it('reads Claude’s JSON for a BodySpec report, converting pounds to kg', () => {
    const { date, scan } = parseScanJson('```json\n{"date":"2026-10-15","total_mass_lb":150.2,"body_fat_pct":"18.4%","fat_mass_lb":27.6,"lean_mass_lb":114.9,"bone_mass_lb":7.7,"vat_mass_lb":0.6,"regional_fat_pct":{"trunk":19.1}}\n```')
    expect(date).toBe('2026-10-15')
    expect(scan.bodyFatPct).toBe(18.4)
    expect(scan.fatMassKg! / KG_PER_LB).toBeCloseTo(27.6, 2)
    expect(scan.regions?.trunk).toBe(19.1)
    expect(() => parseScanJson('{"date":"2026-10-15"}')).toThrow(/body fat/)
  })

  it('compares the latest scan with the previous and the first', () => {
    const scans = [
      { bodyFatPct: 22, fatMassKg: lb(34), leanMassKg: lb(112) },
      { bodyFatPct: 20, fatMassKg: lb(31), leanMassKg: lb(113) },
      { bodyFatPct: 18.5, fatMassKg: lb(28), leanMassKg: lb(114) },
    ]
    const c = scanChanges(scans)
    expect(c.find((x) => x.label === 'Body fat')).toMatchObject({ latest: 18.5, sincePrevious: -1.5, sinceFirst: -3.5 })
    expect(c.find((x) => x.label === 'Lean mass')).toMatchObject({ latest: 114, sincePrevious: 1, lowerIsBetter: false })
    expect(recompSummary(scans)).toMatch(/lost 3.0 lb of fat and gained 1.0 lb of lean mass. That is recomposition/)
  })
})
