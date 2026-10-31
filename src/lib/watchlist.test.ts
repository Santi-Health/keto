import { describe, expect, it } from 'vitest'
import {
  computeWatchList,
  detectFishSpecies,
  detectHeavyMetalRisk,
  detectProcessedMeat,
  detectSweeteners,
} from './watchlist'

describe('detectFishSpecies', () => {
  it('tells albacore apart from light tuna', () => {
    expect(detectFishSpecies('StarKist Solid White Albacore Tuna in Water')).toBe('tuna_albacore')
    expect(detectFishSpecies('Chunk Light Tuna')).toBe('tuna_light')
    expect(detectFishSpecies('Ahi tuna steak')).toBe('tuna_yellowfin')
  })
  it('finds other fish and ignores non-fish', () => {
    expect(detectFishSpecies('Wild sockeye salmon fillet')).toBe('salmon')
    expect(detectFishSpecies('Sardines in olive oil')).toBe('sardine')
    expect(detectFishSpecies('Ribeye steak')).toBeNull()
  })
})

describe('detectProcessedMeat', () => {
  it('matches cured meats by name or category', () => {
    expect(detectProcessedMeat('Thick cut bacon')).toBe(true)
    expect(detectProcessedMeat('Genoa salami')).toBe(true)
    expect(detectProcessedMeat('Something', ['en:prepared-meats'])).toBe(true)
  })
  it('does not match words that only contain "ham"', () => {
    expect(detectProcessedMeat('Hamburger patty, 80/20 ground beef')).toBe(false)
    expect(detectProcessedMeat('Chicken thigh')).toBe(false)
  })
})

describe('detectSweeteners', () => {
  it('reads E-numbers and ingredient names, skipping stevia', () => {
    expect(detectSweeteners('water, citric acid, sucralose', ['en:e950']).sort()).toEqual(['acesulfame K', 'sucralose'])
    expect(detectSweeteners('erythritol, stevia leaf extract')).toEqual([])
  })
})

describe('detectHeavyMetalRisk', () => {
  it('flags dark chocolate and protein powders', () => {
    expect(detectHeavyMetalRisk('85% Dark Chocolate')).toBe(true)
    expect(detectHeavyMetalRisk('Whey protein isolate powder')).toBe(true)
    expect(detectHeavyMetalRisk('Almonds')).toBe(false)
  })
})

describe('computeWatchList', () => {
  const ctx = { calorieTarget: 2000, weightKg: 68 }

  it('limits saturated fat to 10% of the calorie target', () => {
    const sat = computeWatchList([{ satFat: 25 }], [], ctx).find((i) => i.key === 'satFat')!
    expect(sat.limit).toBe(22) // 2000 × 10% ÷ 9
    expect(sat.status).toBe('over')
  })

  it('totals mercury over the week against the EPA dose', () => {
    const merc = computeWatchList([], [{ mercuryUg: 20 }, { mercuryUg: 20 }], ctx).find((i) => i.key === 'mercury')!
    expect(merc.limit).toBe(48) // 0.1 × 68 × 7
    expect(merc.value).toBe(40)
    expect(merc.status).toBe('near')
  })

  it('computes the omega ratio only when omega-3 is known', () => {
    const items = computeWatchList([{ omega6: 10, omega3: 2 }], [], ctx)
    expect(items.find((i) => i.key === 'omegaRatio')!.value).toBe(5)
    expect(computeWatchList([{ omega6: 10 }], [], ctx).find((i) => i.key === 'omegaRatio')!.value).toBeNull()
  })

  it('respects turned-off items and edited limits', () => {
    const items = computeWatchList([{ caffeineMg: 300 }], [], ctx, {
      caffeine: { limit: 200 },
      alcohol: { enabled: false },
    })
    expect(items.find((i) => i.key === 'caffeine')!.status).toBe('over')
    expect(items.some((i) => i.key === 'alcohol')).toBe(false)
  })
})
