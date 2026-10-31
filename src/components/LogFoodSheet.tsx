import { useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { MEALS, mealForTime, portionNutrients, type Food, type LogEntry, type Meal, type NewFood } from '../lib/foods'
import { toGrams, unitsFor } from '../lib/units'
import { FoodFlags, MacroStrip, foodSubtitle } from './FoodBits'
import { Sheet } from './Sheet'

interface Props {
  /** A saved food, or a database/scan result that gets saved when logged. */
  food: Food | NewFood
  /** When set, edits this existing entry instead of logging a new one. */
  entry?: LogEntry
  /** Day to log on (YYYY-MM-DD); defaults to now. */
  date?: string
  onClose: () => void
  onEditFood?: (food: Food | NewFood) => void
  onDone?: () => void
}

/** "YYYY-MM-DDTHH:mm" in local time, for datetime-local inputs. */
const toLocalInput = (d: Date) => {
  const off = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

function defaultTime(date?: string): Date {
  const now = new Date()
  if (!date) return now
  const d = new Date(`${date}T12:00:00`)
  return d.toDateString() === now.toDateString() ? now : d
}

export function LogFoodSheet({ food, entry, date, onClose, onEditFood, onDone }: Props) {
  const { saveFood, logFood, updateLog, deleteLog, updateFood } = useData()
  const saved = 'id' in food ? food : null
  const units = unitsFor({ unitConversions: food.unit_conversions })
  const firstUnit = food.unit_conversions[0]?.unit ?? 'g'
  const [amount, setAmount] = useState(String(entry?.amount ?? saved?.meta.lastAmount ?? (firstUnit === 'g' ? 100 : 1)))
  const [unit, setUnit] = useState(entry?.unit ?? saved?.meta.lastUnit ?? firstUnit)
  const start = entry ? new Date(entry.eaten_at) : defaultTime(date)
  const [time, setTime] = useState(toLocalInput(start))
  const [meal, setMeal] = useState<Meal>(entry?.meal ?? mealForTime(start))
  const [favorite, setFavorite] = useState(saved?.favorite ?? false)

  const qty = Number(amount)
  const valid = Number.isFinite(qty) && qty > 0
  const portion = useMemo(() => {
    if (!valid) return null
    const { grams, approximate } = toGrams({ unitConversions: food.unit_conversions }, qty, unit)
    const asFood = { ...food, id: '', favorite: false, use_count: 0, last_used_at: null, updated_at: '', deleted_at: null } as Food
    return { grams, approximate, n: portionNutrients(asFood, grams) }
  }, [food, qty, unit, valid])

  function submit() {
    if (!valid) return
    const eatenAt = new Date(time)
    if (entry) {
      // Editing an entry whose food was deleted reuses its snapshot without re-saving the food.
      const f = saved ?? ({ ...food, id: entry.food_id ?? '', favorite: false, use_count: 0, last_used_at: null, updated_at: '', deleted_at: null } as Food)
      const { grams, approximate } = toGrams({ unitConversions: f.unit_conversions }, qty, unit)
      updateLog({
        ...entry,
        amount: qty,
        unit,
        meal,
        grams,
        eaten_at: eatenAt.toISOString(),
        nutrients: portionNutrients(f, grams),
        meta: { ...entry.meta, approximate },
      })
    } else {
      const f = saved ?? saveFood(food)
      logFood(favorite !== f.favorite ? { ...f, favorite } : f, qty, unit, meal, eatenAt)
    }
    onDone?.()
    onClose()
  }

  function toggleFavorite() {
    setFavorite(!favorite)
    if (saved) updateFood({ ...saved, favorite: !favorite })
  }

  const estimated = food.source === 'ai_estimate' || food.fields_estimated.length > 0

  return (
    <Sheet title={food.name} subtitle={foodSubtitle(food)} onClose={onClose}>
      <FoodFlags food={food} portion={portion?.n} />
      {portion && <MacroStrip n={portion.n} estimated={estimated} />}
      {portion && (
        <p className="muted small" style={{ marginTop: -4 }}>
          {portion.grams.toFixed(0)} g{portion.approximate ? ' (approximate: volume converted as water)' : ''}
          {portion.n.sodiumMg != null && ` · sodium ${portion.n.sodiumMg.toFixed(0)} mg`}
          {portion.n.satFat != null && ` · sat fat ${portion.n.satFat.toFixed(1)} g`}
        </p>
      )}
      {food.keto_notes && <p className="notice small">{food.keto_notes}</p>}

      <div className="row">
        <div className="field">
          <label htmlFor="amt">Amount</label>
          <input id="amt" type="number" inputMode="decimal" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1.4 }}>
          <label htmlFor="unit">Unit</label>
          <select id="unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="meal">Meal</label>
          <select id="meal" value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>
            {MEALS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1.4 }}>
          <label htmlFor="when">When</label>
          <input id="when" type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={submit} disabled={!valid}>
          {entry ? 'Save changes' : 'Log it'}
        </button>
        <button type="button" className="btn secondary" onClick={toggleFavorite} aria-pressed={favorite}>
          {favorite ? '★ Favorite' : '☆ Favorite'}
        </button>
      </div>
      <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        {onEditFood && (
          <button type="button" className="btn secondary" onClick={() => onEditFood(food)}>
            {food.source === 'recipe' ? 'Edit recipe' : 'Edit food details'}
          </button>
        )}
        {entry && (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              deleteLog(entry.id)
              onDone?.()
              onClose()
            }}
          >
            Delete entry
          </button>
        )}
      </div>
    </Sheet>
  )
}
