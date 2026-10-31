import { describe, expect, it } from 'vitest'
import { gki, netCarbs } from './nutrition'

describe('netCarbs', () => {
  it('subtracts fiber from total carbs', () => {
    expect(netCarbs({ carbsTotalG: 10, fiberG: 6 })).toBe(4)
  })

  it('subtracts erythritol fully and maltitol by half', () => {
    expect(
      netCarbs({
        carbsTotalG: 20,
        fiberG: 3,
        sugarAlcohols: [
          { type: 'erythritol', g: 8 },
          { type: 'maltitol', g: 4 },
        ],
      }),
    ).toBe(7)
  })

  it('does not subtract fiber twice on EU-style labels', () => {
    expect(netCarbs({ carbsTotalG: 4, fiberG: 6, carbsExcludeFiber: true })).toBe(4)
  })

  it('never goes negative', () => {
    expect(netCarbs({ carbsTotalG: 2, fiberG: 5 })).toBe(0)
  })
})

describe('gki', () => {
  it('converts glucose to mmol/L before dividing', () => {
    expect(gki(90, 1)).toBeCloseTo(5)
  })
  it('is undefined for zero ketones', () => {
    expect(gki(90, 0)).toBeNull()
  })
})
