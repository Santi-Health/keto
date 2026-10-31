import { describe, expect, it } from 'vitest'
import { ageOn, bmrMifflin, computeTargets, lbToKg } from './targets'
import { DEFAULT_PROFILE, type Profile } from './types'

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  ...DEFAULT_PROFILE,
  ...overrides,
})

describe('ageOn', () => {
  it('counts the birthday itself', () => {
    expect(ageOn('1984-06-02', new Date(2026, 5, 2))).toBe(42)
  })
  it('is one less the day before the birthday', () => {
    expect(ageOn('1984-06-02', new Date(2026, 5, 1))).toBe(41)
  })
})

describe('bmrMifflin', () => {
  it('matches the published formula for men and women', () => {
    expect(bmrMifflin(70, 175, 40, 'male')).toBeCloseTo(1598.75)
    expect(bmrMifflin(70, 175, 40, 'female')).toBeCloseTo(1432.75)
  })
  it('uses the midpoint when sex is unspecified', () => {
    expect(bmrMifflin(70, 175, 40, 'unspecified')).toBeCloseTo(1515.75)
  })
})

describe('computeTargets', () => {
  const oct30 = new Date(2026, 9, 30)

  it('sets protein to 1 g per lb of body weight', () => {
    expect(computeTargets(profile({ weightKg: lbToKg(150) }), oct30).proteinG).toBe(150)
  })

  it('leaves calories and fat empty without height and warns', () => {
    const t = computeTargets(profile({ heightCm: null }), oct30)
    expect(t.calories).toBeNull()
    expect(t.fatG).toBeNull()
    expect(t.warnings.some((w) => w.includes('height'))).toBe(true)
  })

  it('prefers the Fitbit burn over the estimate', () => {
    const t = computeTargets(profile({ heightCm: 175, deficitPct: 0.1 }), oct30, 3000)
    expect(t.burnSource).toBe('fitbit')
    expect(t.calories).toBe(2700)
    // (2700 − 150×4 − 25×4) / 9 = 222.2
    expect(t.fatG).toBe(222)
  })

  it('caps the deficit at 20%', () => {
    const t = computeTargets(profile({ heightCm: 175, deficitPct: 0.5 }), oct30, 3000)
    expect(t.calories).toBe(2400)
  })

  it('estimates burn from BMR and activity when Fitbit is missing', () => {
    const t = computeTargets(
      profile({ heightCm: 175, sex: 'male', activityLevel: 'moderate', weightKg: 70 }),
      oct30,
    )
    expect(t.burnSource).toBe('estimate')
    // age 42: 10×70 + 6.25×175 − 5×42 + 5 = 1588.75; × 1.55 = 2462.6
    expect(t.estimatedBurn).toBe(2463)
  })
})
