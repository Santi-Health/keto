import type { ActivityLevel, Profile, Sex } from './types'

export const KG_PER_LB = 0.45359237
export const CM_PER_IN = 2.54

export const lbToKg = (lb: number) => lb * KG_PER_LB
export const kgToLb = (kg: number) => kg / KG_PER_LB

export const ACTIVITY_FACTORS: Record<ActivityLevel, { factor: number; label: string }> = {
  sedentary: { factor: 1.2, label: 'Sedentary (desk job, little exercise)' },
  light: { factor: 1.375, label: 'Light (exercise 1–3 days/week)' },
  moderate: { factor: 1.55, label: 'Moderate (exercise 3–5 days/week)' },
  active: { factor: 1.725, label: 'Active (hard exercise 6–7 days/week)' },
  very_active: { factor: 1.9, label: 'Very active (physical job + training)' },
}

export const MAX_DEFICIT = 0.2

/** YYYY-MM-DD in the device's time zone. */
export function localDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Whole years between birthDate and today. */
export function ageOn(birthDate: string, today: Date = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number)
  let age = today.getFullYear() - y
  const beforeBirthday =
    today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)
  if (beforeBirthday) age--
  return age
}

/**
 * Mifflin-St Jeor resting energy expenditure (kcal/day).
 * With sex unspecified, uses the midpoint of the male (+5) and female (−161) constants.
 */
export function bmrMifflin(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const sexConstant = sex === 'male' ? 5 : sex === 'female' ? -161 : -78
  return 10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant
}

export interface Targets {
  age: number
  /** Null when height is missing. */
  bmr: number | null
  /** Estimated burn from profile, null when height is missing. */
  estimatedBurn: number | null
  /** Burn the calorie target is based on (Fitbit when provided, otherwise estimate). */
  burn: number | null
  burnSource: 'fitbit' | 'estimate' | 'none'
  calories: number | null
  /** True when the calorie ceiling lowered today's target. */
  capped: boolean
  isRefeed: boolean
  proteinG: number
  netCarbsG: number
  /** Null when calories can't be computed. */
  fatG: number | null
  fiberG: number
  sodiumMg: number
  potassiumMg: number
  magnesiumMg: number
  /** Things the user should fill in for accurate numbers. */
  warnings: string[]
}

/**
 * Daily targets. `actualBurn` is the day's total calories burned from Fitbit, when available.
 */
export function computeTargets(
  profile: Profile,
  today: Date = new Date(),
  actualBurn?: number | null,
): Targets {
  const warnings: string[] = []
  const age = ageOn(profile.birthDate, today)

  let bmr: number | null = null
  let estimatedBurn: number | null = null
  if (profile.heightCm) {
    bmr = bmrMifflin(profile.weightKg, profile.heightCm, age, profile.sex)
    estimatedBurn = bmr * ACTIVITY_FACTORS[profile.activityLevel].factor
  } else {
    warnings.push('Add your height to calculate calories and fat.')
  }
  if (profile.sex === 'unspecified') {
    warnings.push('Set your sex for a more accurate calorie estimate (±80 kcal).')
  }

  const burn = actualBurn ?? estimatedBurn
  const burnSource = actualBurn != null ? 'fitbit' : estimatedBurn != null ? 'estimate' : 'none'

  // Refeed days eat at maintenance (no deficit, no ceiling); carbs stay at the keto limit.
  const isRefeed = profile.refeedDate === localDate(today)
  const deficit = isRefeed ? 0 : Math.min(Math.max(profile.deficitPct, 0), MAX_DEFICIT)
  let calories = burn != null ? burn * (1 - deficit) : null
  const cap = isRefeed ? null : profile.calorieCapKcal
  let capped = false
  if (cap != null && (calories == null || calories > cap)) {
    calories = cap
    capped = true
  }
  const proteinG = kgToLb(profile.weightKg) * profile.proteinPerLb
  const netCarbsG = profile.netCarbLimitG
  const fatG = calories != null ? Math.max(0, (calories - proteinG * 4 - netCarbsG * 4) / 9) : null

  return {
    age,
    bmr: bmr != null ? Math.round(bmr) : null,
    estimatedBurn: estimatedBurn != null ? Math.round(estimatedBurn) : null,
    burn: burn != null ? Math.round(burn) : null,
    burnSource,
    calories: calories != null ? Math.round(calories) : null,
    capped,
    isRefeed,
    proteinG: Math.round(proteinG),
    netCarbsG,
    fatG: fatG != null ? Math.round(fatG) : null,
    fiberG: profile.fiberG,
    sodiumMg: profile.sodiumMg,
    potassiumMg: profile.potassiumMg,
    magnesiumMg: profile.magnesiumMg,
    warnings,
  }
}
