import { describe, expect, it } from 'vitest'
import { ageOn, bmrMifflin, computeTargets, lbToKg, liveFatBudget } from './targets'
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
    const t = computeTargets(profile({ heightCm: null, calorieCapKcal: null }), oct30)
    expect(t.calories).toBeNull()
    expect(t.fatG).toBeNull()
    expect(t.warnings.some((w) => w.includes('height'))).toBe(true)
  })

  it('prefers the Fitbit burn over the estimate', () => {
    const t = computeTargets(profile({ heightCm: 175, deficitPct: 0.1, calorieCapKcal: null }), oct30, 3000)
    expect(t.burnSource).toBe('fitbit')
    expect(t.calories).toBe(2700)
    // (2700 − 150×4 − 25×4) / 9 = 222.2
    expect(t.fatG).toBe(222)
  })

  it('caps the deficit at 20%', () => {
    const t = computeTargets(profile({ heightCm: 175, deficitPct: 0.5, calorieCapKcal: null }), oct30, 3000)
    expect(t.calories).toBe(2400)
  })

  it('never goes above the calorie ceiling', () => {
    const t = computeTargets(profile({ heightCm: 175, deficitPct: 0.1, calorieCapKcal: 2000 }), oct30, 3000)
    expect(t.calories).toBe(2000)
    expect(t.capped).toBe(true)
    // (2000 − 150×4 − 25×4) / 9 = 144.4
    expect(t.fatG).toBe(144)
  })

  it('warns about muscle loss when the ceiling forces a deficit over 20%', () => {
    const t = computeTargets(profile({ heightCm: 175, calorieCapKcal: 2000 }), oct30, 3000)
    expect(t.effectiveDeficit).toBeCloseTo(0.333, 3)
    expect(t.muscleWarning).toContain('33% deficit')
  })

  it('does not warn on a moderate deficit or a refeed day', () => {
    expect(computeTargets(profile({ heightCm: 175, calorieCapKcal: 2500, deficitPct: 0.12 }), oct30, 2700).muscleWarning).toBeNull()
    expect(
      computeTargets(profile({ heightCm: 175, calorieCapKcal: 2000, refeedDate: '2026-10-30' }), oct30, 3000).muscleWarning,
    ).toBeNull()
  })

  it('applies the ceiling even without height', () => {
    const t = computeTargets(profile({ heightCm: null, calorieCapKcal: 2000 }), oct30)
    expect(t.calories).toBe(2000)
  })

  it('eats at maintenance with no ceiling on a refeed day', () => {
    const t = computeTargets(
      profile({ heightCm: 175, deficitPct: 0.1, calorieCapKcal: 2000, refeedDate: '2026-10-30' }),
      oct30,
      3000,
    )
    expect(t.isRefeed).toBe(true)
    expect(t.calories).toBe(3000)
    expect(t.netCarbsG).toBe(25)
  })

  it('only treats the marked date as a refeed day', () => {
    const t = computeTargets(
      profile({ heightCm: 175, calorieCapKcal: 2000, refeedDate: '2026-10-29' }),
      oct30,
      3000,
    )
    expect(t.isRefeed).toBe(false)
    expect(t.calories).toBe(2000)
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

  it('shrinks the fat budget when protein goes over, but not below 20% of calories', () => {
    const t = computeTargets(profile({ heightCm: 175, calorieCapKcal: 2000 }), oct30, 3000)
    expect(t.fatMinG).toBe(44) // 2000 × 20% ÷ 9
    expect(liveFatBudget(t, { protein: 0, netCarbs: 0 })).toBe(144)
    // 200 g protein instead of 150: (2000 − 800 − 100) / 9 = 122
    expect(liveFatBudget(t, { protein: 200, netCarbs: 10 })).toBe(122)
    expect(liveFatBudget(t, { protein: 400, netCarbs: 25 })).toBe(44)
  })
})
