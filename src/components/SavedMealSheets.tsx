import { useState } from 'react'
import { useData } from '../lib/data'
import { MEALS, type Food, type LogEntry, type Meal } from '../lib/foods'
import { addNutrients } from '../lib/nutrients'
import { defaultMealName, itemFood, itemNutrients, mealFromEntries, type SavedMeal, type SavedMealItem } from '../lib/savedMeals'
import { formatAmount } from '../lib/units'
import { MacroStrip } from './FoodBits'
import { Sheet } from './Sheet'

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

function defaultTime(date?: string): Date {
  const now = new Date()
  if (!date) return now
  const d = new Date(`${date}T12:00:00`)
  return d.toDateString() === now.toDateString() ? now : d
}

/** Names and saves one meal slot of a day (e.g. today's breakfast) as a saved meal. */
export function SaveMealSheet({ entries, meal, onClose }: { entries: LogEntry[]; meal: Meal; onClose: () => void }) {
  const { savedMeals, saveMeal, foodById } = useData()
  const [name, setName] = useState(() => defaultMealName(meal, savedMeals.map((m) => m.name)))
  const draft = mealFromEntries(name, entries, foodById, meal)
  const skipped = entries.length - draft.items.length

  function save() {
    if (!name.trim() || !draft.items.length) return
    saveMeal({ ...draft, id: crypto.randomUUID(), updated_at: new Date().toISOString(), deleted_at: null })
    onClose()
  }

  return (
    <Sheet title="Save as a meal" subtitle="Log these foods together in one tap next time" onClose={onClose}>
      <div className="field">
        <label htmlFor="sm-name">Name</label>
        <input id="sm-name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="list" style={{ marginBottom: 12 }}>
        {draft.items.map((i, k) => (
          <div key={k} className="list-item" style={{ cursor: 'default' }}>
            <span className="grow">
              <span className="title" style={{ display: 'block' }}>
                {i.food.name}
              </span>
              <span className="sub" style={{ display: 'block' }}>
                {formatAmount(i.amount, i.unit)}
              </span>
            </span>
          </div>
        ))}
      </div>
      {skipped > 0 && (
        <p className="muted small">
          {skipped} item{skipped > 1 ? 's' : ''} can't be included because the food was deleted.
        </p>
      )}
      <button type="button" className="btn" onClick={save} disabled={!name.trim() || !draft.items.length}>
        Save meal
      </button>
    </Sheet>
  )
}

interface Row extends SavedMealItem {
  on: boolean
  amountText: string
}

/** Logs a saved meal: untick what you skipped, adjust portions, then log everything at once. Also edits the meal. */
export function LogSavedMealSheet({
  savedMeal,
  date,
  meal: initialMeal,
  onClose,
  onDone,
}: {
  savedMeal: SavedMeal
  date?: string
  meal: Meal
  onClose: () => void
  onDone: () => void
}) {
  const { foodById, saveFood, logFood, saveMeal, deleteMeal } = useData()
  const [name, setName] = useState(savedMeal.name)
  // The slot it was saved from ("Usual breakfast"), unless it has none.
  const [meal, setMeal] = useState<Meal>(savedMeal.meta.meal ?? initialMeal)
  const [time, setTime] = useState(toLocalInput(defaultTime(date)))
  const [rows, setRows] = useState<Row[]>(() => savedMeal.items.map((i) => ({ ...i, on: true, amountText: String(i.amount) })))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const current = (r: Row): SavedMealItem => ({ foodId: r.foodId, food: r.food, unit: r.unit, amount: Number(r.amountText) > 0 ? Number(r.amountText) : r.amount })
  const chosen = rows.filter((r) => r.on && Number(r.amountText) > 0)
  const totals = addNutrients(chosen.map((r) => itemNutrients(current(r), foodById)))
  const changed = name.trim() !== savedMeal.name || rows.some((r, i) => !r.on || Number(r.amountText) !== savedMeal.items[i].amount)
  const update = (i: number, change: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...change } : r)))

  function saveChanges() {
    saveMeal({ ...savedMeal, name: name.trim() || savedMeal.name, items: rows.filter((r) => r.on).map(current) })
  }

  function logAll() {
    const at = new Date(time)
    for (const r of chosen) {
      const f = itemFood(current(r), foodById)
      const food: Food = 'id' in f ? f : saveFood(f)
      logFood(food, Number(r.amountText), r.unit, meal, at)
    }
    saveMeal({ ...savedMeal, use_count: savedMeal.use_count + 1 })
    onDone()
  }

  return (
    <Sheet title={savedMeal.name} subtitle="Untick anything you skipped and adjust portions" onClose={onClose}>
      {rows.map((r, i) => {
        const f = itemFood(current(r), foodById)
        const n = itemNutrients(current(r), foodById)
        return (
          <div key={i} className={`meal-item ${r.on ? '' : 'off'}`}>
            <label className="check" style={{ margin: 0, flex: 1, minWidth: 0 }}>
              <input type="checkbox" checked={r.on} onChange={(e) => update(i, { on: e.target.checked })} />
              <span style={{ minWidth: 0 }}>
                <span className="title" style={{ display: 'block' }}>
                  {f.name}
                </span>
                <span className="sub" style={{ display: 'block' }}>
                  {Math.round(n.kcal ?? 0)} kcal · {(n.netCarbs ?? 0).toFixed(1)} g net · {Math.round(n.protein ?? 0)} g prot
                </span>
              </span>
            </label>
            <div className="row meal-amount">
              <input
                type="number"
                inputMode="decimal"
                aria-label={`Amount of ${f.name}`}
                value={r.amountText}
                disabled={!r.on}
                onChange={(e) => update(i, { amountText: e.target.value })}
              />
              <span className="muted small">{r.unit}</span>
            </div>
          </div>
        )
      })}

      <MacroStrip n={totals} />

      <div className="row">
        <div className="field">
          <label htmlFor="lm-meal">Meal</label>
          <select id="lm-meal" value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>
            {MEALS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1.4 }}>
          <label htmlFor="lm-time">Time</label>
          <input id="lm-time" type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      <button type="button" className="btn" style={{ width: '100%' }} onClick={logAll} disabled={!chosen.length}>
        Log {chosen.length} food{chosen.length === 1 ? '' : 's'}
      </button>

      <details className="small" style={{ marginTop: 14 }}>
        <summary>Edit this saved meal</summary>
        <div className="field" style={{ marginTop: 8 }}>
          <label htmlFor="lm-name">Name</label>
          <input id="lm-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <p className="muted small">Saving keeps the portions above and drops unticked foods from the meal.</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn secondary" disabled={!changed || !rows.some((r) => r.on)} onClick={saveChanges}>
            Save changes to meal
          </button>
          {confirmDelete ? (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                deleteMeal(savedMeal.id)
                onClose()
              }}
            >
              Tap again to delete
            </button>
          ) : (
            <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
              Delete meal
            </button>
          )}
        </div>
      </details>
    </Sheet>
  )
}
