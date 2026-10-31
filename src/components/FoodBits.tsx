import type { Food, NewFood } from '../lib/foods'
import type { Nutrients } from '../lib/nutrients'
import { MERCURY_PPM } from '../lib/watchlist'

const fmt = (n: number | undefined, digits = 0) =>
  n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 })

/** Calories, net carbs, protein and fat for a portion. */
export function MacroStrip({ n, estimated }: { n: Nutrients; estimated?: boolean }) {
  const p = estimated ? '~' : ''
  return (
    <div className="macro-strip">
      <div>
        <strong>{p}{fmt(n.kcal)}</strong>
        <span>kcal</span>
      </div>
      <div>
        <strong style={{ color: 'var(--carbs)' }}>{p}{fmt(n.netCarbs, 1)}g</strong>
        <span>net carbs</span>
      </div>
      <div>
        <strong style={{ color: 'var(--protein)' }}>{p}{fmt(n.protein, 1)}g</strong>
        <span>protein</span>
      </div>
      <div>
        <strong style={{ color: 'var(--fat)' }}>{p}{fmt(n.fat, 1)}g</strong>
        <span>fat</span>
      </div>
    </div>
  )
}

/** Watch-list and keto flags for a food, as small chips. */
export function FoodFlags({ food, portion }: { food: Food | NewFood; portion?: Nutrients }) {
  const m = food.meta
  const chips: { text: string; warn?: boolean }[] = []
  if (m.fishSpecies) {
    const mercury = portion?.mercuryUg
    chips.push({
      text: `${MERCURY_PPM[m.fishSpecies].label}${mercury != null ? ` · ~${mercury.toFixed(0)} µg mercury` : ''}`,
      warn: MERCURY_PPM[m.fishSpecies].ppm >= 0.3,
    })
  }
  if (m.processedMeat) chips.push({ text: 'Processed meat', warn: true })
  if (m.partiallyHydrogenated) chips.push({ text: 'Trans fat (partially hydrogenated)', warn: true })
  if (m.sweeteners?.length) chips.push({ text: `Sweeteners: ${m.sweeteners.join(', ')}` })
  if (m.novaGroup === 4) chips.push({ text: 'Ultra-processed (NOVA 4)' })
  if (m.heavyMetalRisk) chips.push({ text: 'Lead/cadmium risk type', warn: true })
  if (food.carbs_exclude_fiber) chips.push({ text: 'EU/UK label carbs' })
  if (food.source === 'ai_estimate' || food.fields_estimated.length) chips.push({ text: 'Some values estimated' })
  if (food.confidence === 'low') chips.push({ text: 'Incomplete nutrition data', warn: true })
  if (!chips.length) return null
  return (
    <div className="chips" style={{ marginBottom: 10 }}>
      {chips.map((c) => (
        <span key={c.text} className={`chip ${c.warn ? 'warn' : ''}`}>
          {c.text}
        </span>
      ))}
    </div>
  )
}

export function foodSubtitle(food: Food | NewFood): string {
  const per = food.per_100g
  return [food.brand, `${fmt(per.kcal)} kcal · ${fmt(per.netCarbs, 1)}g net carbs per 100 g`].filter(Boolean).join(' · ')
}
