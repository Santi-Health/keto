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
/** Lower end of the Acceptable Macronutrient Distribution Range for fat. */
export const FAT_MIN_PCT = 0.2

function fatBudget(calories: number, proteinG: number, netCarbsG: number, minG: number): number {
  return Math.max(minG, (calories - proteinG * 4 - netCarbsG * 4) / 9)
}

/**
 * Fat left for the rest of the day. Fat isn't a goal: it fills whatever calories remain after
 * protein and carbs. Eating more protein (or carbs) than planned shrinks it, down to the minimum.
 */
export function liveFatBudget(t: Targets, eaten: { protein: number; netCarbs: number }): number | null {
  if (t.calories == null || t.fatMinG == null) return null
  const protein = Math.max(eaten.protein, t.proteinG)
  const carbs = Math.max(eaten.netCarbs, t.netCarbsG)
  return Math.round(fatBudget(t.calories, protein, carbs, t.fatMinG))
}

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
  /** Deficit implied by the calorie target vs. burn (0–1), null when unknown. */
  effectiveDeficit: number | null
  /** Set when the deficit is big enough to risk losing muscle. */
  muscleWarning: string | null
  proteinG: number
  netCarbsG: number
  /** Null when calories can't be computed. */
  /** Fat budget at the start of the day: calories left after protein and carbs, never below the minimum. */
  fatG: number | null
  /** Minimum fat: 20% of calories (lower end of the dietary reference range). */
  fatMinG: number | null
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
  const effectiveDeficit = burn != null && calories != null ? Math.max(0, 1 - calories / burn) : null
  const muscleWarning =
    effectiveDeficit != null && effectiveDeficit > MAX_DEFICIT
      ? `Today's target is a ${Math.round(effectiveDeficit * 100)}% deficit (${Math.round(burn! - calories!).toLocaleString()} kcal under your burn). ` +
        `Above ~${MAX_DEFICIT * 100}% raises the risk of losing muscle: keep protein at target, keep strength training, ` +
        `and plan a refeed after a few days like this.`
      : null

  const proteinG = kgToLb(profile.weightKg) * profile.proteinPerLb
  const netCarbsG = profile.netCarbLimitG
  const fatMinG = calories != null ? (calories * FAT_MIN_PCT) / 9 : null
  const fatG = calories != null ? fatBudget(calories, proteinG, netCarbsG, fatMinG!) : null

  return {
    age,
    bmr: bmr != null ? Math.round(bmr) : null,
    estimatedBurn: estimatedBurn != null ? Math.round(estimatedBurn) : null,
    burn: burn != null ? Math.round(burn) : null,
    burnSource,
    calories: calories != null ? Math.round(calories) : null,
    capped,
    isRefeed,
    effectiveDeficit: effectiveDeficit != null ? Math.round(effectiveDeficit * 1000) / 1000 : null,
    muscleWarning,
    proteinG: Math.round(proteinG),
    netCarbsG,
    fatG: fatG != null ? Math.round(fatG) : null,
    fatMinG: fatMinG != null ? Math.round(fatMinG) : null,
    fiberG: profile.fiberG,
    sodiumMg: profile.sodiumMg,
    potassiumMg: profile.potassiumMg,
    magnesiumMg: profile.magnesiumMg,
    warnings,
  }
}
