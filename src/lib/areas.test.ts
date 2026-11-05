import { describe, expect, it } from 'vitest'
import { AREAS, areaAdvice, areaInsight, microArea, omegaVerdict, watchArea, type AreaView } from './areas'
import type { Food, LogEntry } from './foods'
import { MICROS } from './micros'
import { computeWatchList } from './watchlist'

const TODAY = '2026-11-05'
const dayBefore = (n: number) => {
  const d = new Date(2026, 10, 5 - n, 12)
  return d
}
let id = 0
const log = (name: string, nutrients: LogEntry['nutrients'], daysAgo: number, food_id: string | null = null): LogEntry => ({
  id: String(id++), eaten_at: dayBefore(daysAgo).toISOString(), meal: 'dinner', food_id, food_name: name, amount: 1, unit: '1 serving', grams: 100, nutrients, meta: {}, updated_at: '', deleted_at: null,
})
const view = (logs: LogEntry[], history: LogEntry[], extra: Partial<AreaView> = {}): AreaView => ({
  logs, weekLogs: logs, history: [...history, ...logs], foods: [], days: [TODAY], isToday: true, isWeek: false, tips: [], sex: 'male', age: 45, ...extra,
})
const usualDays = (n: Record<string, number>, days = 10, name = 'Eggs') => Array.from({ length: days }, (_, i) => log(name, n, i + 1))

describe('areaInsight', () => {
  it('says when there is not enough history yet', () => {
    const i = areaInsight(AREAS.protein, view([log('Eggs', { protein: 20 }, 0)], usualDays({ protein: 100 }, 3)))
    expect(i.usual).toBeNull()
    expect(i.loggedDays).toBe(3)
  })

  it('calls a day within 20% of your usual normal', () => {
    const i = areaInsight(AREAS.protein, view([log('Eggs', { protein: 110 }, 0)], usualDays({ protein: 100 })))
    expect(i.change).toBe('same')
    expect(i.lines[0]).toBe('About normal: 110 g, and your usual is 100 g a day.')
  })

  it('does not count the day on screen toward your usual', () => {
    const today = [log('Eggs', { protein: 300 }, 0)]
    expect(areaInsight(AREAS.protein, view(today, usualDays({ protein: 100 }))).usual).toBe(100)
  })

  it('names the food that pushed a day above your usual', () => {
    const logs = [log('Eggs', { sodiumMg: 1000 }, 0), log('Pickles', { sodiumMg: 2000 }, 0)]
    const i = areaInsight(AREAS.sodium, view(logs, usualDays({ sodiumMg: 1000 })))
    expect(i.change).toBe('higher')
    expect(i.lines.join(' ')).toContain('Pickles (+2,000 mg)')
    expect(i.lines.join(' ')).not.toContain('Eggs (+')
  })

  it('reads a trend by which way is good for that area', () => {
    const history = [...Array.from({ length: 5 }, (_, i) => log('Eggs', { protein: 150, netCarbs: 30 }, i + 1)), ...Array.from({ length: 10 }, (_, i) => log('Eggs', { protein: 100, netCarbs: 20 }, i + 10))]
    const logs = [log('Eggs', { protein: 120, netCarbs: 24 }, 0)]
    expect(areaInsight(AREAS.protein, view(logs, history)).lines.join(' ')).toContain('improving')
    expect(areaInsight(AREAS.netCarbs, view(logs, history)).lines.join(' ')).toContain('getting worse')
  })

  it('compares the 7-day view as a daily average', () => {
    const logs = [log('Eggs', { protein: 100 }, 1), log('Eggs', { protein: 100 }, 2)]
    const history = Array.from({ length: 10 }, (_, i) => log('Eggs', { protein: 100 }, i + 9))
    const days = Array.from({ length: 7 }, (_, i) => `2026-11-0${i + 1 > 4 ? 4 : i + 1}`).slice(0, 4)
    const i = areaInsight(AREAS.protein, view(logs, history, { isWeek: true, isToday: false, days: ['2026-10-29', ...days] }))
    expect(i.current).toBe(100)
  })
})

describe('omegaVerdict', () => {
  it('tells which side to work on, and by how much', () => {
    expect(omegaVerdict(20, 1, 4, 'male', 45)).toMatch(/^Both/)
    expect(omegaVerdict(10, 1, 4, 'male', 45)).toMatch(/^Omega-3 is the low side/)
    expect(omegaVerdict(20, 2, 4, 'male', 45)).toMatch(/^Omega-6 is the high side/)
    expect(omegaVerdict(12, 2, 4, 'male', 45)).toMatch(/^Either one/)
    expect(omegaVerdict(10, 1, 4, 'male', 45)).toContain('About 1.5 g more omega-3 reaches 4:1, or 6.0 g less omega-6')
  })
  it('leaves a good ratio alone', () => {
    expect(omegaVerdict(6, 2, 4, 'male', 45)).toMatch(/^The ratio is fine/)
  })
})

describe('areaAdvice', () => {
  const ctx = { calorieTarget: 2000, weightKg: 70 }
  const food = (id: string, name: string, per_100g: Food['per_100g']): Food => ({
    id, name, brand: null, barcode: null, per_100g, unit_conversions: [{ unit: '1 serving', grams: 100 }], ingredients_text: null, keto_notes: null, carbs_exclude_fiber: false,
    source: 'manual', confidence: 'high', fields_estimated: [], favorite: false, use_count: 0, last_used_at: null, meta: {}, updated_at: '', deleted_at: null,
  })
  const omegaItem = (o6: number, o3: number) => computeWatchList([{ omega6: o6, omega3: o3 }], [], ctx).find((i) => i.key === 'omegaRatio')!

  it('names foods to try, skipping ones you already eat and ones that would worsen the ratio', () => {
    const salmon = food('sal', 'Smoked salmon', { omega6: 0.2, omega3: 2, protein: 20 })
    const walnuts = food('wal', 'Walnuts', { omega6: 38, omega3: 9, protein: 15 })
    const history = [log('Smoked salmon', {}, 1, 'sal'), log('Walnuts', {}, 2, 'wal')]
    const logs = [log('Almonds', { fat: 14, omega6: 9, omega3: 0, protein: 6 }, 0)]
    const v = view(logs, history, { foods: [salmon, walnuts] })
    const area = watchArea(omegaItem(9, 0))
    const advice = areaAdvice(area, v, areaInsight(area, v))
    const texts = advice.map((a) => a.text)
    expect(texts.some((t) => t.includes('Smoked salmon'))).toBe(true)
    expect(texts.some((t) => t.includes('Walnuts'))).toBe(false)
    expect(texts).toContain('Try 3 oz herring')
    expect(texts).not.toContain('Try 3 oz salmon')
    expect(texts.find((t) => t.startsWith('Next time'))).toContain('swap Almonds for macadamias')
    expect(advice.find((a) => a.text.includes('Smoked salmon'))!.effect).toContain('ratio goes to 4.6:1')
  })

  it('offers a swap from your own foods and adds your best omega-3 food', () => {
    const mayo = food('mayo', 'Mayo', { omega6: 10, omega3: 0.1, protein: 0 })
    const oil = food('oil', 'Olive oil', { omega6: 1, omega3: 0.1, protein: 0 })
    const salmon = food('sal', 'Salmon', { omega6: 0.2, omega3: 2, protein: 20 })
    const history = [log('Olive oil', {}, 1, 'oil'), log('Salmon', {}, 2, 'sal')]
    const logs = [log('Mayo', { fat: 20, omega6: 10, omega3: 0.1, protein: 0 }, 0, 'mayo')]
    const advice = areaAdvice(watchArea(omegaItem(10, 0.1)), view(logs, history, { foods: [mayo, oil, salmon] }), areaInsight(watchArea(omegaItem(10, 0.1)), view(logs, history)))
    expect(advice[0].kind).toBe('note')
    expect(advice.find((a) => a.kind === 'swap')!.text).toContain('swap Mayo for')
    expect(advice.find((a) => a.kind === 'add')!.text).toContain('Salmon')
  })

  it('falls back to general advice when none of your foods help', () => {
    const logs = [log('Coffee', { caffeineMg: 500 }, 0)]
    const item = computeWatchList([{ caffeineMg: 500 }], [], ctx).find((i) => i.key === 'caffeine')!
    const v = view(logs, [])
    expect(areaAdvice(watchArea(item), v, areaInsight(watchArea(item), v))).toEqual([{ kind: 'note', text: 'Switch a later coffee to decaf or rooibos.' }])
  })

  it('leaves an item alone when it is under its limit and not above your usual', () => {
    const logs = [log('Coffee', { caffeineMg: 100 }, 0)]
    const item = computeWatchList([{ caffeineMg: 100 }], [], ctx).find((i) => i.key === 'caffeine')!
    const v = view(logs, usualDays({ caffeineMg: 100 }))
    expect(areaAdvice(watchArea(item), v, areaInsight(watchArea(item), v))).toEqual([])
  })

  describe('when an area runs low', () => {
    const potassium = { ...AREAS.potassium, target: 4000 }
    const advise = (area: typeof potassium, v: AreaView) => areaAdvice(area, v, areaInsight(area, v))
    const avocado = food('avo', 'Avocado', { potassiumMg: 485, kcal: 160 })
    const eaten = [log('Avocado', {}, 1, 'avo')]

    it('names your own food with what it gets you to, then foods to try', () => {
      const v = view([log('Eggs', { potassiumMg: 1000 }, 0)], eaten, { foods: [avocado] })
      const advice = advise(potassium, v)
      expect(advice[0].text).toContain('Avocado')
      expect(advice[0].effect).toBe('+485 mg potassium, gets you to 1,485 mg of 4,000 mg')
      expect(advice.map((a) => a.text)).toContain('Try 1/2 cup cooked spinach')
      expect(advice.map((a) => a.text)).not.toContain('Try 1/2 avocado')
    })

    it('stays quiet once you are close to the target', () => {
      expect(advise(potassium, view([log('Eggs', { potassiumMg: 3800 }, 0)], []))).toEqual([])
    })

    it('does not call a vitamin low when the foods just have no vitamin data', () => {
      const micro = microArea(MICROS.find((m) => m.key === 'vitCMg')!, 90)
      const noData = view([log('Label bar', { kcal: 200 }, 0)], [])
      expect(areaAdvice(micro, noData, areaInsight(micro, noData))[0].kind).toBe('note')
      const withData = view([log('Eggs', { kcal: 200, vitCMg: 5 }, 0)], [])
      expect(areaAdvice(micro, withData, areaInsight(micro, withData)).map((a) => a.text)).toContain('Try 1/2 cup red bell pepper')
    })
  })

  it('files a suggestion under every area it helps', () => {
    const tip = { kind: 'add' as const, text: 'Add 1 egg', effect: '', goal: 'leucine', helps: ['leucine', 'protein', 'potassium'] }
    const v = view([log('Eggs', { protein: 10 }, 0)], [], { tips: [tip] })
    expect(areaAdvice(AREAS.protein, v, areaInsight(AREAS.protein, v))).toHaveLength(1)
    expect(areaAdvice(AREAS.potassium, v, areaInsight(AREAS.potassium, v))).toHaveLength(1)
    expect(areaAdvice(AREAS.fiber, v, areaInsight(AREAS.fiber, v))).toHaveLength(0)
  })
})
