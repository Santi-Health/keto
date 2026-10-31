import { describe, expect, it } from 'vitest'
import { aminoTargets, estimateAminos } from './aminoAcids'
import { addNutrients } from './nutrients'
import { mapUsdaFood } from './foodApi'

describe('estimateAminos', () => {
  it('fills amino acids from protein when a food has none, and records how much was estimated', () => {
    const n = estimateAminos({ protein: 30 })
    expect(n.leuG).toBeCloseTo(2.46)
    expect(n.aminoEstimatedG).toBe(30)
  })
  it('leaves real data alone', () => {
    const n = estimateAminos({ protein: 30, leuG: 2.6 })
    expect(n.leuG).toBe(2.6)
    expect(n.aminoEstimatedG).toBeUndefined()
  })
})

describe('aminoTargets', () => {
  it('sets RDA and muscle levels from body weight', () => {
    const t = aminoTargets(addNutrients([{ leuG: 5, metG: 1, cysG: 0.5 }]), 68)
    const leu = t.find((a) => a.key === 'leuG')!
    expect(leu.rda).toBeCloseTo(2.856) // 42 mg/kg
    expect(leu.muscle).toBeCloseTo(8.92, 1) // 1.6 g/kg protein × 8.2% leucine
    expect(t.find((a) => a.key === 'metG')!.value).toBe(1.5) // methionine + cysteine
  })
})

describe('USDA amino acids', () => {
  it('maps leucine and lysine numbers', () => {
    const f = mapUsdaFood({
      fdcId: 1,
      description: 'Egg, whole, raw, fresh',
      dataType: 'SR Legacy',
      foodNutrients: [
        { nutrientNumber: '203', value: 12.6 },
        { nutrientNumber: '504', value: 1.09 },
        { nutrientNumber: '505', value: 0.91 },
      ],
    })
    expect(f.per_100g.leuG).toBe(1.09)
    expect(f.per_100g.lysG).toBe(0.91)
  })
})
