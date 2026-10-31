import type { Food, NewFood } from '../lib/foods'
import { scaleNutrients } from '../lib/nutrients'

/** The serving a package label would use: the food's first portion, or 100 g if it has none. */
export function labelServing(food: Food | NewFood): { label: string; grams: number } {
  const first = food.unit_conversions[0]
  if (!first) return { label: '100 g', grams: 100 }
  // "1 serving (1 bar (40 g))" → "1 bar (40 g)"; plain portions get their weight added.
  const inner = first.unit.match(/^1 serving \((.*)\)$/)?.[1]
  const name = inner ?? first.unit
  const hasWeight = /\d\s*(g|oz|ml)\b/i.test(name)
  return { label: hasWeight ? name : `${name} (${Math.round(first.grams)} g)`, grams: first.grams }
}

const n0 = (v: number | undefined) => (v == null ? '—' : Math.round(v).toLocaleString())
const n1 = (v: number | undefined) => (v == null ? '—' : v < 10 ? (Math.round(v * 10) / 10).toString() : Math.round(v).toString())

/** A small card with label-style numbers for one serving, for quick comparison. */
export function FoodRow({ food, onPick }: { food: Food | NewFood; onPick: () => void }) {
  const saved = 'id' in food ? food : null
  const serving = labelServing(food)
  const n = scaleNutrients(food.per_100g, serving.grams)
  const est = food.source === 'ai_estimate' || food.fields_estimated.length > 0 ? '~' : ''
  return (
    <button type="button" className="food-card" onClick={onPick}>
      <span className="food-card-name">
        {saved?.favorite && <span className="star">★</span>}
        {food.source === 'recipe' && <span aria-hidden="true">🍳 </span>}
        {food.name}
        {food.brand && <span className="muted"> · {food.brand}</span>}
      </span>
      <span className="food-card-serving">per {serving.label}</span>
      <span className="food-card-label">
        <span>
          <b>
            {est}
            {n0(n.kcal)}
          </b>
          Cal
        </span>
        <span>
          <b style={{ color: 'var(--carbs)' }}>
            {est}
            {n1(n.netCarbs)}g
          </b>
          Net carbs
        </span>
        <span>
          <b style={{ color: 'var(--protein)' }}>
            {est}
            {n1(n.protein)}g
          </b>
          Protein
        </span>
        <span>
          <b style={{ color: 'var(--fat)' }}>
            {est}
            {n1(n.fat)}g
          </b>
          Fat
        </span>
      </span>
    </button>
  )
}
