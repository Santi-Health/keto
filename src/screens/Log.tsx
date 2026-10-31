import { useMemo, useState } from 'react'
import { MacroStrip } from '../components/FoodBits'
import { FoodForm } from '../components/FoodForm'
import { LogFoodSheet } from '../components/LogFoodSheet'
import { RecipeBuilder } from '../components/RecipeBuilder'
import { useData } from '../lib/data'
import { MEALS, type Food, type LogEntry, type NewFood } from '../lib/foods'
import { addNutrients, type NutrientKey, type Nutrients } from '../lib/nutrients'
import { localDate } from '../lib/targets'
import { formatAmount } from '../lib/units'

interface Props {
  date: string
  onDateChange: (date: string) => void
  onAdd: (date: string) => void
}

const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return localDate(d)
}

/** Rebuilds a food from a log entry when the original food was deleted. */
function foodFromEntry(e: LogEntry): NewFood {
  const per100: Nutrients = {}
  for (const [k, v] of Object.entries(e.nutrients) as [NutrientKey, number][]) {
    if (!k.endsWith('Servings') && e.grams > 0) per100[k] = (v * 100) / e.grams
  }
  return {
    name: e.food_name,
    brand: null,
    barcode: null,
    per_100g: per100,
    unit_conversions: e.unit === 'g' || e.unit === 'oz' ? [] : [{ unit: e.unit, grams: e.grams / e.amount }],
    ingredients_text: null,
    keto_notes: null,
    carbs_exclude_fiber: false,
    source: 'manual',
    confidence: 'medium',
    fields_estimated: [],
    meta: {
      sweeteners: e.nutrients.sweetenerServings ? ['unknown'] : [],
      novaGroup: e.nutrients.ultraProcessedServings ? 4 : null,
      heavyMetalRisk: !!e.nutrients.heavyMetalServings,
    },
  }
}

export function Log({ date, onDateChange, onAdd }: Props) {
  const { logsOn, foodById } = useData()
  const [editing, setEditing] = useState<{ entry: LogEntry; food: Food | NewFood } | null>(null)
  const [editingFood, setEditingFood] = useState<Food | NewFood | null>(null)
  const entries = logsOn(date)
  const total = useMemo(() => addNutrients(entries.map((e) => e.nutrients)), [entries])
  const today = localDate()
  const label =
    date === today
      ? 'Today'
      : date === shiftDate(today, -1)
        ? 'Yesterday'
        : new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <>
      <header className="page-header">
        <h1>Log</h1>
        <div className="row" style={{ flex: '0 0 auto' }}>
          <button type="button" className="icon-btn" aria-label="Previous day" onClick={() => onDateChange(shiftDate(date, -1))}>
            ‹
          </button>
          <input
            type="date"
            aria-label="Day"
            value={date}
            max={today}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
            style={{ minHeight: 36, padding: '4px 8px' }}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label="Next day"
            disabled={date >= today}
            onClick={() => onDateChange(shiftDate(date, 1))}
          >
            ›
          </button>
        </div>
      </header>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h2>{label}</h2>
          <button type="button" className="btn" onClick={() => onAdd(date)}>
            + Add food
          </button>
        </div>
        <MacroStrip n={total} />

        {entries.length === 0 && <p className="muted small">Nothing logged for this day yet.</p>}
        {MEALS.map((m) => {
          const items = entries.filter((e) => e.meal === m.value)
          if (!items.length) return null
          const sub = addNutrients(items.map((e) => e.nutrients))
          return (
            <div key={m.value}>
              <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{m.label}</span>
                <span>
                  {Math.round(sub.kcal)} kcal · {sub.netCarbs.toFixed(1)}g net
                </span>
              </div>
              <div className="list">
                {items.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="list-item"
                    onClick={() => setEditing({ entry: e, food: (e.food_id && foodById[e.food_id]) || foodFromEntry(e) })}
                  >
                    <span className="grow">
                      <span className="title" style={{ display: 'block' }}>
                        {e.food_name}
                      </span>
                      <span className="sub" style={{ display: 'block' }}>
                        {formatAmount(e.amount, e.unit)} · {new Date(e.eaten_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        {e.meta.approximate ? ' · approx.' : ''}
                      </span>
                    </span>
                    <span className="right">
                      {e.meta.estimated ? '~' : ''}
                      {Math.round(e.nutrients.kcal ?? 0)} kcal
                      <span className="sub" style={{ display: 'block' }}>
                        {(e.nutrients.netCarbs ?? 0).toFixed(1)}g net · {(e.nutrients.protein ?? 0).toFixed(0)}g prot
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <LogFoodSheet
          food={editing.food}
          entry={editing.entry}
          onClose={() => setEditing(null)}
          onEditFood={(food) => {
            setEditing(null)
            setEditingFood(food)
          }}
        />
      )}
      {editingFood &&
        ('id' in editingFood && editingFood.source === 'recipe' ? (
          <RecipeBuilder recipe={editingFood} onClose={() => setEditingFood(null)} onSaved={() => setEditingFood(null)} />
        ) : (
          <FoodForm food={editingFood} onClose={() => setEditingFood(null)} onSaved={() => setEditingFood(null)} />
        ))}
    </>
  )
}
