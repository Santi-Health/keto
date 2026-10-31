import type { Nutrients } from './nutrients'

/** The nine essential amino acids, with their partner where requirements are set jointly. */
export const AMINO_ACIDS = [
  { key: 'leuG', name: 'Leucine', short: 'Leu', rdaMgPerKg: 42 },
  { key: 'ileG', name: 'Isoleucine', short: 'Ile', rdaMgPerKg: 19 },
  { key: 'valG', name: 'Valine', short: 'Val', rdaMgPerKg: 24 },
  { key: 'lysG', name: 'Lysine', short: 'Lys', rdaMgPerKg: 38 },
  { key: 'metG', name: 'Methionine + cysteine', short: 'Met+Cys', rdaMgPerKg: 19, plus: 'cysG' },
  { key: 'pheG', name: 'Phenylalanine + tyrosine', short: 'Phe+Tyr', rdaMgPerKg: 33, plus: 'tyrG' },
  { key: 'thrG', name: 'Threonine', short: 'Thr', rdaMgPerKg: 20 },
  { key: 'trpG', name: 'Tryptophan', short: 'Trp', rdaMgPerKg: 5 },
  { key: 'hisG', name: 'Histidine', short: 'His', rdaMgPerKg: 14 },
] as const satisfies readonly { key: AminoKey; name: string; short: string; rdaMgPerKg: number; plus?: AminoKey }[]

export type AminoKey = 'leuG' | 'ileG' | 'valG' | 'lysG' | 'metG' | 'cysG' | 'pheG' | 'tyrG' | 'thrG' | 'trpG' | 'hisG'

export const AMINO_KEYS: AminoKey[] = ['leuG', 'ileG', 'valG', 'lysG', 'metG', 'cysG', 'pheG', 'tyrG', 'thrG', 'trpG', 'hisG']

/**
 * Typical high-quality animal protein (meat, fish, eggs, dairy), grams of each amino acid per
 * 100 g protein. Used to estimate foods without amino acid data, and to set the muscle level.
 */
export const REFERENCE_PROFILE: Record<AminoKey, number> = {
  leuG: 8.2,
  ileG: 4.8,
  valG: 5.3,
  lysG: 8.3,
  metG: 2.7,
  cysG: 1.2,
  pheG: 4.2,
  tyrG: 3.6,
  thrG: 4.4,
  trpG: 1.2,
  hisG: 3.1,
}

/** Sports-nutrition guidance (ISSN) for keeping or building muscle: 1.6 g protein per kg per day. */
export const MUSCLE_PROTEIN_G_PER_KG = 1.6

export const LEUCINE_PER_MEAL_G = { maintain: 2.5, build: 3 } as const
export type MuscleGoal = keyof typeof LEUCINE_PER_MEAL_G

export const hasAminoData = (n: Nutrients) => n.leuG != null || n.lysG != null

/** Fills in amino acids from protein using the reference profile, for foods that don't list them. */
export function estimateAminos(n: Nutrients): Nutrients {
  if (hasAminoData(n) || !n.protein) return n
  const out = { ...n, aminoEstimatedG: n.protein }
  for (const k of AMINO_KEYS) out[k] = (n.protein * REFERENCE_PROFILE[k]) / 100
  return out
}

export interface AminoTarget {
  key: AminoKey
  name: string
  short: string
  /** Grams eaten (including its partner for Met+Cys and Phe+Tyr). */
  value: number
  /** Official minimum (RDA), grams per day. */
  rda: number
  /** What 1.6 g/kg of quality protein provides, grams per day. */
  muscle: number
}

export function aminoTargets(total: Required<Nutrients>, weightKg: number): AminoTarget[] {
  return AMINO_ACIDS.map((a) => {
    const plus = 'plus' in a ? a.plus : null
    const value = total[a.key] + (plus ? total[plus] : 0)
    const profile = REFERENCE_PROFILE[a.key] + (plus ? REFERENCE_PROFILE[plus] : 0)
    return {
      key: a.key,
      name: a.name,
      short: a.short,
      value,
      rda: (a.rdaMgPerKg * weightKg) / 1000,
      muscle: (MUSCLE_PROTEIN_G_PER_KG * weightKg * profile) / 100,
    }
  })
}
