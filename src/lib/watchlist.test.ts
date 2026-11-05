import { describe, expect, it } from 'vitest'
import {
  computeWatchList,
  detectFishSpecies,
  detectHeavyMetalRisk,
  detectSweeteners,
  watchBreakdown,
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
  it('flags sweeteners and ultra-processed foods yellow when eaten', () => {
    const w = computeWatchList([{ sweetenerServings: 1, ultraProcessedServings: 2 }], [], { calorieTarget: 2000, weightKg: 68 })
    expect(w.find((i) => i.key === 'sweeteners')!.status).toBe('caution')
    expect(w.find((i) => i.key === 'ultraProcessed')!.status).toBe('caution')
    expect(computeWatchList([{}], [], { calorieTarget: 2000, weightKg: 68 }).find((i) => i.key === 'sweeteners')!.status).toBe('info')
  })
})

describe('watchBreakdown', () => {
  const log = (food_name: string, nutrients: Record<string, number>) => ({ food_name, nutrients })

  it('splits the omega ratio into each side, biggest food first', () => {
    const [six, three] = watchBreakdown('omegaRatio', [
      log('Almonds', { fat: 14, omega6: 3, omega3: 0 }),
      log('Mayo', { fat: 10, omega6: 5, omega3: 0.5 }),
      log('Salmon', { fat: 12, omega6: 0.2, omega3: 2 }),
    ])
    expect(six.label).toBe('Omega-6')
    expect(six.foods.map((f) => f.name)).toEqual(['Mayo', 'Almonds', 'Salmon'])
    expect(six.total).toBeCloseTo(8.2, 1)
    expect(three.foods.map((f) => f.name)).toEqual(['Salmon', 'Mayo'])
    expect(three.foods[0].pct).toBe(80)
  })

  it('adds up repeat logs of a food', () => {
    const [part] = watchBreakdown('caffeine', [log('Coke Zero', { caffeineMg: 34 }), log('Coke Zero', { caffeineMg: 34 })])
    expect(part.foods).toEqual([{ name: 'Coke Zero', amount: 68, pct: 100 }])
  })

  it('names fatty foods with no omega data, but not lean ones or ones that have it', () => {
    const [six] = watchBreakdown('omegaRatio', [
      log('Label bar', { fat: 12 }),
      log('Mate cocido', { fat: 0.2 }),
      log('Eggs', { fat: 10, omega6: 1 }),
      log('Butter', { fat: 11, omega6: 0 }),
    ])
    expect(six.missing).toEqual(['Label bar'])
  })

  it('does not call a food missing for items where blank means none', () => {
    expect(watchBreakdown('mercury', [log('Steak', { fat: 20 })])[0].missing).toEqual([])
  })
})
