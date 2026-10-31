/**
 * Nutrient amounts. Stored per 100 g on foods, and as absolute amounts on log entries.
 * Grams unless noted. Missing keys mean "unknown" and count as 0 in totals.
 */
export interface Nutrients {
  kcal?: number
  protein?: number
  fat?: number
  satFat?: number
  transFat?: number
  carbs?: number
  fiber?: number
  sugars?: number
  addedSugars?: number
  sugarAlcohols?: number
  /** Computed from carbs, fiber and sugar alcohols when the food is saved. */
  netCarbs?: number
  sodiumMg?: number
  potassiumMg?: number
  magnesiumMg?: number
  calciumMg?: number
  ironMg?: number
  cholesterolMg?: number
  omega3?: number
  omega6?: number
  caffeineMg?: number
  alcohol?: number
  /** Preformed vitamin A (retinol), µg. */
  retinolUg?: number
  // Vitamins and trace minerals.
  /** Vitamin A as retinol activity equivalents, µg. */
  vitAUg?: number
  vitCMg?: number
  /** Vitamin D (D2 + D3), µg. */
  vitDUg?: number
  /** Vitamin E (alpha-tocopherol), mg. */
  vitEMg?: number
  vitKUg?: number
  thiaminMg?: number
  b6Mg?: number
  /** Folate as dietary folate equivalents, µg. */
  folateUg?: number
  b12Ug?: number
  cholineMg?: number
  zincMg?: number
  seleniumUg?: number
  // Watch list amounts, filled in on log entries only.
  mercuryUg?: number
  processedMeatG?: number
  sweetenerServings?: number
  ultraProcessedServings?: number
  heavyMetalServings?: number
  // Essential amino acids, grams.
  leuG?: number
  ileG?: number
  valG?: number
  lysG?: number
  metG?: number
  cysG?: number
  pheG?: number
  tyrG?: number
  thrG?: number
  trpG?: number
  hisG?: number
  /** Protein whose amino acids were estimated from a typical profile (no data for that food). */
  aminoEstimatedG?: number
}

export type NutrientKey = keyof Nutrients

export const NUTRIENT_INFO: Record<NutrientKey, { label: string; unit: string }> = {
  kcal: { label: 'Calories', unit: 'kcal' },
  protein: { label: 'Protein', unit: 'g' },
  fat: { label: 'Fat', unit: 'g' },
  satFat: { label: 'Saturated fat', unit: 'g' },
  transFat: { label: 'Trans fat', unit: 'g' },
  carbs: { label: 'Total carbs', unit: 'g' },
  fiber: { label: 'Fiber', unit: 'g' },
  sugars: { label: 'Sugars', unit: 'g' },
  addedSugars: { label: 'Added sugars', unit: 'g' },
  sugarAlcohols: { label: 'Sugar alcohols', unit: 'g' },
  netCarbs: { label: 'Net carbs', unit: 'g' },
  sodiumMg: { label: 'Sodium', unit: 'mg' },
  potassiumMg: { label: 'Potassium', unit: 'mg' },
  magnesiumMg: { label: 'Magnesium', unit: 'mg' },
  calciumMg: { label: 'Calcium', unit: 'mg' },
  ironMg: { label: 'Iron', unit: 'mg' },
  cholesterolMg: { label: 'Cholesterol', unit: 'mg' },
  omega3: { label: 'Omega-3', unit: 'g' },
  omega6: { label: 'Omega-6', unit: 'g' },
  caffeineMg: { label: 'Caffeine', unit: 'mg' },
  alcohol: { label: 'Alcohol', unit: 'g' },
  retinolUg: { label: 'Vitamin A (retinol)', unit: 'µg' },
  vitAUg: { label: 'Vitamin A', unit: 'µg' },
  vitCMg: { label: 'Vitamin C', unit: 'mg' },
  vitDUg: { label: 'Vitamin D', unit: 'µg' },
  vitEMg: { label: 'Vitamin E', unit: 'mg' },
  vitKUg: { label: 'Vitamin K', unit: 'µg' },
  thiaminMg: { label: 'Thiamin (B1)', unit: 'mg' },
  b6Mg: { label: 'Vitamin B6', unit: 'mg' },
  folateUg: { label: 'Folate', unit: 'µg' },
  b12Ug: { label: 'Vitamin B12', unit: 'µg' },
  cholineMg: { label: 'Choline', unit: 'mg' },
  zincMg: { label: 'Zinc', unit: 'mg' },
  seleniumUg: { label: 'Selenium', unit: 'µg' },
  mercuryUg: { label: 'Mercury', unit: 'µg' },
  processedMeatG: { label: 'Processed meat', unit: 'g' },
  sweetenerServings: { label: 'Artificial sweeteners', unit: 'servings' },
  ultraProcessedServings: { label: 'Ultra-processed foods', unit: 'servings' },
  heavyMetalServings: { label: 'Lead/cadmium risk foods', unit: 'servings' },
  leuG: { label: 'Leucine', unit: 'g' },
  ileG: { label: 'Isoleucine', unit: 'g' },
  valG: { label: 'Valine', unit: 'g' },
  lysG: { label: 'Lysine', unit: 'g' },
  metG: { label: 'Methionine', unit: 'g' },
  cysG: { label: 'Cysteine', unit: 'g' },
  pheG: { label: 'Phenylalanine', unit: 'g' },
  tyrG: { label: 'Tyrosine', unit: 'g' },
  thrG: { label: 'Threonine', unit: 'g' },
  trpG: { label: 'Tryptophan', unit: 'g' },
  hisG: { label: 'Histidine', unit: 'g' },
  aminoEstimatedG: { label: 'Protein with estimated amino acids', unit: 'g' },
}

/** Nutrients that scale with portion size (everything except per-serving counts). */
const SCALED_KEYS = (Object.keys(NUTRIENT_INFO) as NutrientKey[]).filter(
  (k) => !k.endsWith('Servings'),
)

/** Amounts in `grams` of a food whose nutrients are given per 100 g. */
export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  const out: Nutrients = {}
  for (const k of SCALED_KEYS) {
    const v = per100g[k]
    if (v != null) out[k] = (v * grams) / 100
  }
  return out
}

export function addNutrients(items: Nutrients[]): Required<Nutrients> {
  const total = Object.fromEntries(Object.keys(NUTRIENT_INFO).map((k) => [k, 0])) as Required<Nutrients>
  for (const n of items) {
    for (const k of Object.keys(n) as NutrientKey[]) total[k] += n[k] ?? 0
  }
  return total
}

/** Calories from macros when a source doesn't list energy. */
export function kcalFromMacros(n: Nutrients): number {
  return (n.protein ?? 0) * 4 + (n.carbs ?? 0) * 4 + (n.fat ?? 0) * 9 + (n.alcohol ?? 0) * 7
}
