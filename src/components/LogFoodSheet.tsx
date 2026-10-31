import { useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { MEALS, mealForTime, portionNutrients, setUsual, usualMealsFor, type Food, type FoodMeta, type LogEntry, type Meal, type NewFood } from '../lib/foods'
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
  /** Meal chosen on the Add screen; defaults to one that fits the time. */
  meal?: Meal
  onClose: () => void
  onEditFood?: (food: Food | NewFood) => void
  onDone?: () => void
  /** log: log it (default). save: keep it in My Foods without logging. look: just see the nutrition, save if you like. */
  mode?: AddMode
  /** Called after "Save to My Foods". */
  onSavedFood?: (food: Food) => void
}

export type AddMode = 'log' | 'save' | 'look'

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

export function LogFoodSheet({ food, entry, date, meal: chosenMeal, onClose, onEditFood, onDone, mode = 'log', onSavedFood }: Props) {
  const logging = mode === 'log' || !!entry
  const { saveFood, logFood, updateLog, deleteLog, updateFood, logs } = useData()
  const saved = 'id' in food ? food : null
  const units = unitsFor({ unitConversions: food.unit_conversions })
  const firstUnit = food.unit_conversions[0]?.unit ?? 'g'
  const [amount, setAmount] = useState(String(entry?.amount ?? saved?.meta.lastAmount ?? (firstUnit === 'g' ? 100 : 1)))
  const [unit, setUnit] = useState(entry?.unit ?? saved?.meta.lastUnit ?? firstUnit)
  const start = entry ? new Date(entry.eaten_at) : defaultTime(date)
  const [time, setTime] = useState(toLocalInput(start))
  const [meal, setMeal] = useState<Meal>(entry?.meal ?? chosenMeal ?? mealForTime(start))
  // What the app currently treats as usual (tags + history); changes are saved as overrides.
  const [usualMeta, setUsualMeta] = useState<FoodMeta>(food.meta)
  const usualMeals = usualMealsFor({ id: saved?.id ?? '', meta: usualMeta }, logs)
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
      logFood({ ...f, favorite, meta: { ...f.meta, meals: usualMeta.meals, notMeals: usualMeta.notMeals } }, qty, unit, meal, eatenAt)
    }
    onDone?.()
    onClose()
  }

  /** Keep it in My Foods without logging, remembering this amount as its usual portion. */
  function saveOnly() {
    const f = saved ?? saveFood(food)
    const keep: Food = { ...f, favorite, meta: { ...f.meta, meals: usualMeta.meals, notMeals: usualMeta.notMeals, ...(valid ? { lastAmount: qty, lastUnit: unit } : {}) } }
    updateFood(keep)
    onSavedFood?.(keep)
    onClose()
  }

  function toggleUsual(m: Meal) {
    const next = setUsual(usualMeta, m, !usualMeals.includes(m))
    setUsualMeta(next)
    if (saved) updateFood({ ...saved, favorite, meta: { ...saved.meta, meals: next.meals, notMeals: next.notMeals } })
  }

  function toggleFavorite() {
    setFavorite(!favorite)
    if (saved) updateFood({ ...saved, favorite: !favorite, meta: { ...saved.meta, meals: usualMeta.meals, notMeals: usualMeta.notMeals } })
  }

  const estimated = food.source === 'ai_estimate' || food.fields_estimated.length > 0

  return (
    <Sheet
      title={food.name}
      subtitle={
        logging
          ? `${entry ? 'Editing' : 'Logging to'} ${MEALS.find((m) => m.value === meal)!.label.toLowerCase()} · ${foodSubtitle(food)}`
          : `${mode === 'save' ? 'Save without logging' : 'Just looking: nothing is logged'} · ${foodSubtitle(food)}`
      }
      onClose={onClose}
    >
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
      {logging && (
      <>
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

      <div className="field">
        <span className="label">Usually eaten at</span>
        <div className="chips">
          {MEALS.map((m) => (
            <button key={m.value} type="button" className={`chip-btn ${usualMeals.includes(m.value) ? 'on' : ''}`} aria-pressed={usualMeals.includes(m.value)} onClick={() => toggleUsual(m.value)}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="hint">Highlighted meals show this food under "Usual for…". Tap to add or remove; it overrides what the app learned.</div>
      </div>
      </>
      )}

      {!logging && (
        <p className="muted small">
          {saved
            ? 'Already in My Foods. Change the amount to see other portions.'
            : mode === 'save'
              ? 'Saves it to My Foods (with this amount as your usual portion) so it\u2019s one tap to log later.'
              : 'Change the amount to see other portions. Close to leave it, or save it if you buy it.'}
        </p>
      )}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {logging ? (
          <button type="button" className="btn" onClick={submit} disabled={!valid}>
            {entry ? 'Save changes' : 'Log it'}
          </button>
        ) : mode === 'save' && !saved ? (
          <button type="button" className="btn" onClick={saveOnly}>
            Save to My Foods
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={onClose}>
              Done
            </button>
            {!saved && (
              <button type="button" className="btn secondary" onClick={saveOnly}>
                Save to My Foods
              </button>
            )}
          </>
        )}
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
