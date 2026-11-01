import { useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { MEALS, portionNutrients, type Food, type LogEntry, type Meal } from '../lib/foods'
import { SECTIONS, frac, nutCount, portionText, sectionsOf, servingOf, shortName, unshout } from '../lib/quickFoods'
import type { SavedMeal } from '../lib/savedMeals'
import { toGrams } from '../lib/units'
import { DeleteFood } from './DeleteFood'
import { FoodIcon } from './FoodIcon'
import { defaultTime } from './LogFoodSheet'
import { Sheet } from './Sheet'

export type QuickItem = { kind: 'food'; food: Food } | { kind: 'meal'; meal: SavedMeal }

/** Food buttons like the drink buttons: icon, short name, the brand when two read the same, and the usual serving. */
export function FoodButtons({
  items,
  brands,
  counts,
  onPick,
}: {
  items: QuickItem[]
  brands: Record<string, string>
  /** Times each food was logged at this meal today, shown as a badge. */
  counts: Record<string, number>
  onPick: (item: QuickItem) => void
}) {
  return (
    <div className="drink-grid">
      {items.map((it) =>
        it.kind === 'meal' ? (
          <button key={it.meal.id} type="button" className="drink-btn food-btn saved" onClick={() => onPick(it)}>
            <span className="food-ico" aria-hidden="true">
              🍽️
            </span>
            <span className="drink-name">{it.meal.name}</span>
            <span className="drink-serving">saved meal</span>
          </button>
        ) : (
          <button key={it.food.id} type="button" className="drink-btn food-btn" onClick={() => onPick(it)} aria-label={`${it.food.name}${it.food.brand ? `, ${it.food.brand}` : ''}`}>
            <span className="food-ico" aria-hidden="true">
              <FoodIcon food={it.food} />
            </span>
            <span className="drink-name">{shortName(it.food)}</span>
            {brands[it.food.id] && <span className="food-brand">{brands[it.food.id]}</span>}
            <span className="drink-serving">{servingText(it.food)}</span>
            {counts[it.food.id] ? <span className="drink-count">{counts[it.food.id]}</span> : null}
          </button>
        ),
      )}
    </div>
  )
}

/**
 * What one portion reads as: "1 slice", "1 oz (~23)" for whole nuts, "1 serv. (~3)" for olives,
 * and recipes with their weight, "1 serv. (300 g)".
 */
function portionLabel(food: Food, amount: number, unit: string): string {
  const grams = toGrams({ unitConversions: food.unit_conversions }, amount, unit).grams
  const extra = food.source === 'recipe' ? `${Math.round(grams)} g` : nutCount(food, grams, unit)
  const portion = portionText(amount, unit)
  return extra ? `${portion} (${extra})` : portion
}

/** The serving on a button. */
const servingText = (food: Food) => portionLabel(food, servingOf(food).amount, servingOf(food).unit)

const STEPS = [0.5, 1, 1.5, 2]

/**
 * Tap a food button: its full name, how much (one serving by default), what that adds, and Log.
 * Other amounts, editing, renaming the button and its section are one tap further.
 */
export function QuickLogSheet({
  food,
  meal,
  date,
  onLogged,
  onMore,
  onEdit,
  onClose,
}: {
  food: Food
  meal: Meal
  date?: string
  onLogged: (entry: LogEntry, text: string) => void
  /** Open the full log sheet (any amount or unit, time, usual meals). */
  onMore: () => void
  onEdit: () => void
  onClose: () => void
}) {
  const { logFood, updateFood } = useData()
  const serving = servingOf(food)
  const [steps, setSteps] = useState(1)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(shortName(food))
  const amount = serving.amount * steps
  const grams = toGrams({ unitConversions: food.unit_conversions }, amount, serving.unit).grams
  const n = useMemo(() => portionNutrients(food, grams), [food, grams])
  const portion = portionLabel(food, amount, serving.unit)
  const mealLabel = MEALS.find((m) => m.value === meal)!.label.toLowerCase()
  const sections = sectionsOf(food)
  const fmt = (v: number | undefined, d = 0) => (v == null ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString())

  function log() {
    const entry = logFood(food, amount, serving.unit, meal, defaultTime(date))
    onLogged(entry, `${portion} ${shortName(food)}`)
  }

  function rename() {
    const clean = name.trim()
    updateFood({ ...food, meta: { ...food.meta, buttonName: clean && clean !== food.name ? clean : undefined } })
    setRenaming(false)
  }

  return (
    <Sheet title={unshout(food.name)} subtitle={food.brand ?? undefined} onClose={onClose}>
      <span className="label">
        How much
        {serving.unit !== 'g' && ` · ${portionText(1, serving.unit)}${portionText(1, serving.unit).startsWith('1 serv.') ? '' : ' per serv.'}`}
      </span>
      <div className="portion-steps" role="group" aria-label="Servings">
        {STEPS.map((s) => (
          <button key={s} type="button" aria-pressed={steps === s} onClick={() => setSteps(s)}>
            {serving.unit === 'g' ? `${s * 100} g` : frac(s)}
          </button>
        ))}
      </div>
      <div className="portion-macros">
        <span>
          <b>{fmt(n.kcal)}</b>kcal
        </span>
        <span>
          <b>{fmt(n.netCarbs, 1)} g</b>net carbs
        </span>
        <span>
          <b>{fmt(n.protein)} g</b>protein
        </span>
        <span>
          <b>{fmt(n.fat)} g</b>fat
        </span>
      </div>
      <button type="button" className="btn" style={{ width: '100%' }} onClick={log}>
        Log {portion} to {mealLabel}
      </button>
      {renaming ? (
        <div className="row" style={{ marginTop: 10 }}>
          <input aria-label="Button name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <button type="button" className="btn secondary small-btn" onClick={rename}>
            Save
          </button>
        </div>
      ) : (
        <div className="quick-links">
          <button type="button" onClick={onMore}>
            Other amount or time
          </button>
          <button type="button" onClick={onEdit}>
            Edit food
          </button>
          <button type="button" onClick={() => setRenaming(true)}>
            Rename button
          </button>
          <DeleteFood food={food} onDeleted={onClose} asLink />
        </div>
      )}
      <div className="section-chips" role="group" aria-label="Sections on the Add screen">
        <span className="muted small">Sections</span>
        {SECTIONS.map((sec) => {
          const on = sections.includes(sec.key)
          return (
            <button
              key={sec.key}
              type="button"
              className={`chip-btn ${on ? 'on' : ''}`}
              aria-pressed={on}
              onClick={() => updateFood({ ...food, meta: { ...food.meta, group: undefined, sections: on ? sections.filter((k) => k !== sec.key) : [...sections, sec.key] } })}
            >
              {sec.title}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
