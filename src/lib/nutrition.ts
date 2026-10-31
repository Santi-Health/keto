export type SugarAlcoholType =
  | 'erythritol'
  | 'allulose'
  | 'xylitol'
  | 'sorbitol'
  | 'maltitol'
  | 'glycerin'
  | 'other'

/** Fraction of each sugar alcohol subtracted from total carbs. */
export const SUGAR_ALCOHOL_SUBTRACT: Record<SugarAlcoholType, number> = {
  erythritol: 1,
  allulose: 1,
  xylitol: 0.5,
  sorbitol: 0.5,
  maltitol: 0.5,
  glycerin: 0.5,
  other: 0.5,
}

export interface CarbInput {
  carbsTotalG: number
  fiberG?: number | null
  sugarAlcohols?: { type: SugarAlcoholType; g: number }[]
  /** EU/UK labels list carbohydrate already excluding fiber. */
  carbsExcludeFiber?: boolean
}

export function netCarbs({
  carbsTotalG,
  fiberG,
  sugarAlcohols = [],
  carbsExcludeFiber = false,
}: CarbInput): number {
  const fiber = carbsExcludeFiber ? 0 : (fiberG ?? 0)
  const alcohols = sugarAlcohols.reduce((sum, a) => sum + a.g * SUGAR_ALCOHOL_SUBTRACT[a.type], 0)
  return Math.max(0, carbsTotalG - fiber - alcohols)
}

export const MGDL_PER_MMOL_GLUCOSE = 18

/** Glucose-Ketone Index: glucose (mmol/L) ÷ blood ketones (mmol/L). */
export function gki(glucoseMgDl: number, ketonesMmol: number): number | null {
  if (ketonesMmol <= 0) return null
  return glucoseMgDl / MGDL_PER_MMOL_GLUCOSE / ketonesMmol
}
