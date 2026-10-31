import { DEFAULT_YOGA_ROUTINE, type Routine } from './exercise'
import type { WatchSettings } from './watchlist'

export type Sex = 'male' | 'female' | 'unspecified'

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'

export type WeightUnit = 'lb' | 'kg'
export type HeightUnit = 'ftin' | 'cm'
export type Theme = 'system' | 'light' | 'dark'

/** User profile and target settings. Body measurements are stored in metric. */
export interface Profile {
  birthDate: string // YYYY-MM-DD
  sex: Sex
  heightCm: number | null
  weightKg: number
  activityLevel: ActivityLevel
  /** Grams of protein per pound of body weight. */
  proteinPerLb: number
  /** Calorie deficit applied to daily burn, 0–0.20. */
  deficitPct: number
  /** Daily calorie ceiling, lifted on refeed days. Null for no ceiling. */
  calorieCapKcal: number | null
  /** Local date (YYYY-MM-DD) marked as a refeed day. */
  refeedDate: string | null
  netCarbLimitG: number
  sodiumMg: number
  potassiumMg: number
  magnesiumMg: number
  fiberG: number
  waterOz: number
  weightUnit: WeightUnit
  heightUnit: HeightUnit
  theme: Theme
  watchList: WatchSettings
  /** Sets the leucine-per-meal target: 2.5 g to maintain muscle, 3 g to build. */
  muscleGoal: 'maintain' | 'build'
  /** Usual yoga days and time, for one-tap logging. Null turns the reminder off. */
  yogaRoutine: Routine | null
  /** Average daily burn from Fitbit (last 7 full days), used instead of the estimate. */
  fitbitBurnKcal?: number | null
  fitbitBurnDays?: number
  /** Latest weigh-in already copied into weightKg. */
  weightReadingId?: string | null
  /** ISO timestamp of the last local edit, used to resolve sync conflicts. */
  updatedAt: string
}

export const DEFAULT_PROFILE: Profile = {
  birthDate: '1984-06-02',
  sex: 'male',
  heightCm: 173,
  weightKg: 68.04, // 150 lb
  activityLevel: 'active',
  proteinPerLb: 1,
  deficitPct: 0.12,
  calorieCapKcal: 2000,
  refeedDate: null,
  netCarbLimitG: 25,
  sodiumMg: 4000,
  potassiumMg: 4000,
  magnesiumMg: 400,
  fiberG: 25,
  waterOz: 100,
  weightUnit: 'lb',
  heightUnit: 'cm',
  theme: 'system',
  watchList: {},
  muscleGoal: 'build',
  yogaRoutine: DEFAULT_YOGA_ROUTINE,
  updatedAt: new Date(0).toISOString(),
}
