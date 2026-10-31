import type { Nutrients } from './nutrients'
import type { Sex } from './types'

/**
 * The vitamins and trace minerals worth watching, with daily targets from the US Dietary Reference
 * Intakes (RDA, or AI where no RDA exists) and upper limits where going over matters.
 */
export type MicroKey = 'vitDUg' | 'b12Ug' | 'folateUg' | 'vitCMg' | 'vitKUg' | 'vitAUg' | 'vitEMg' | 'thiaminMg' | 'b6Mg' | 'zincMg' | 'seleniumUg' | 'cholineMg' | 'calciumMg' | 'ironMg'

export interface Micro {
  key: MicroKey
  label: string
  unit: string
  /** Why it matters on keto / for this user. */
  why: string
  target: (sex: Sex, age: number) => number
  /** Tolerable upper limit from food + supplements, when relevant. */
  upper?: number
}

const bySex = (male: number, female: number) => (sex: Sex) => (sex === 'female' ? female : sex === 'male' ? male : Math.max(male, female))

export const MICROS: Micro[] = [
  { key: 'vitDUg', label: 'Vitamin D', unit: 'µg', why: 'Low in most diets; linked to insulin sensitivity.', target: (_s, age) => (age > 70 ? 20 : 15), upper: 100 },
  { key: 'b12Ug', label: 'Vitamin B12', unit: 'µg', why: 'Nerves and red blood cells; eggs, fish and meat.', target: () => 2.4 },
  { key: 'folateUg', label: 'Folate', unit: 'µg', why: 'Runs low on keto when vegetables are low.', target: () => 400 },
  { key: 'vitCMg', label: 'Vitamin C', unit: 'mg', why: 'Runs low on keto with little fruit; peppers and greens help.', target: (s) => bySex(90, 75)(s) },
  { key: 'vitKUg', label: 'Vitamin K', unit: 'µg', why: 'Blood clotting and bones; leafy greens.', target: (s) => bySex(120, 90)(s) },
  { key: 'vitAUg', label: 'Vitamin A', unit: 'µg', why: 'Eyes and immunity; eggs, liver, greens.', target: (s) => bySex(900, 700)(s), upper: 3000 },
  { key: 'vitEMg', label: 'Vitamin E', unit: 'mg', why: 'Antioxidant; nuts and seeds.', target: () => 15 },
  { key: 'thiaminMg', label: 'Thiamin (B1)', unit: 'mg', why: 'Drops when grains are cut; pork and seeds.', target: (s) => bySex(1.2, 1.1)(s) },
  { key: 'b6Mg', label: 'Vitamin B6', unit: 'mg', why: 'Protein metabolism; fish, poultry.', target: (s, age) => (age > 50 ? bySex(1.7, 1.5)(s) : 1.3) },
  { key: 'zincMg', label: 'Zinc', unit: 'mg', why: 'Muscle repair and testosterone; meat and seeds.', target: (s) => bySex(11, 8)(s), upper: 40 },
  { key: 'seleniumUg', label: 'Selenium', unit: 'µg', why: 'Thyroid; fish, eggs, Brazil nuts.', target: () => 55, upper: 400 },
  { key: 'cholineMg', label: 'Choline', unit: 'mg', why: 'Liver fat handling; eggs are the top source.', target: (s) => bySex(550, 425)(s), upper: 3500 },
  { key: 'calciumMg', label: 'Calcium', unit: 'mg', why: 'Bones; dairy and canned fish.', target: (s, age) => (age > 50 && s === 'female' ? 1200 : age > 70 ? 1200 : 1000), upper: 2500 },
  { key: 'ironMg', label: 'Iron', unit: 'mg', why: 'Oxygen transport; red meat and shellfish.', target: (s, age) => (s === 'female' && age <= 50 ? 18 : 8), upper: 45 },
]

export interface MicroStatus {
  micro: Micro
  value: number
  target: number
  pct: number
  over: boolean
}

/** Today's vitamins against targets, lowest first. */
export function microStatus(total: Nutrients, sex: Sex, age: number): MicroStatus[] {
  return MICROS.map((m) => {
    const value = total[m.key] ?? 0
    const target = m.target(sex, age)
    return { micro: m, value, target, pct: target > 0 ? (value / target) * 100 : 0, over: m.upper != null && value > m.upper }
  }).sort((a, b) => a.pct - b.pct)
}

/** Share of the day's calories from foods that have vitamin data (so low numbers aren't misread). */
export function vitaminCoverage(items: Nutrients[]): number {
  const kcal = items.reduce((s, n) => s + (n.kcal ?? 0), 0)
  if (kcal <= 0) return 0
  const covered = items.filter((n) => n.vitCMg != null || n.vitDUg != null || n.b12Ug != null || n.folateUg != null || n.vitAUg != null).reduce((s, n) => s + (n.kcal ?? 0), 0)
  return Math.round((covered / kcal) * 100)
}
