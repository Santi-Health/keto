import { useMemo, useState } from 'react'
import { MacroStrip } from '../components/FoodBits'
import { FoodForm } from '../components/FoodForm'
import { ExerciseSheet } from '../components/ExerciseSheet'
import { LogFoodSheet } from '../components/LogFoodSheet'
import { ReadingSheet } from '../components/ReadingSheet'
import { RecipeBuilder } from '../components/RecipeBuilder'
import { SaveMealSheet } from '../components/SavedMealSheets'
import { useData } from '../lib/data'
import { sessionLabel, type Exercise } from '../lib/exercise'
import { MEALS, type Food, type LogEntry, type Meal, type NewFood } from '../lib/foods'
import { addNutrients, type NutrientKey, type Nutrients } from '../lib/nutrients'
import { CONTEXTS, KG_PER_LB, URINE_LEVELS, type ReadingRow } from '../lib/readings'
import { localDate } from '../lib/targets'
import type { WeightUnit } from '../lib/types'
import { formatAmount } from '../lib/units'

interface Props {
  weightKg: number
  weightUnit: WeightUnit
  netCarbLimit: number
  proteinTarget: number
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

/** "0.8 mmol/L ketones", "Urine: small", "150.2 lb" … */
function readingText(r: ReadingRow, unit: WeightUnit): string {
  switch (r.kind) {
    case 'blood_ketone':
      return `Ketones ${r.value?.toFixed(1)} mmol/L`
    case 'glucose':
      return `Glucose ${r.value} mg/dL`
    case 'urine_ketone':
      return `Urine strip: ${URINE_LEVELS.find((u) => u.value === r.urine_level)?.label.toLowerCase()}`
    case 'weight': {
      const w = r.value == null ? '' : (unit === 'lb' ? r.value / KG_PER_LB : r.value).toFixed(1)
      return `Weight ${w} ${unit}${r.meta.bodyFatPct != null ? ` · ${r.meta.bodyFatPct}% fat` : ''}`
    }
    case 'lab':
      return `${r.meta.test ?? 'Lab'} ${r.value}${r.unit === '%' ? '%' : ` ${r.unit ?? ''}`}`
    case 'water':
      return `Water ${(r.value ?? 0) / 8} cups (${r.value} oz)`
  }
}

export function Log({ weightKg, weightUnit, netCarbLimit, proteinTarget, date, onDateChange, onAdd }: Props) {
  const { logsOn, foodById, exercisesOn, readingsOn } = useData()
  const [readingSheet, setReadingSheet] = useState<{ reading?: ReadingRow } | null>(null)
  const [savingMeal, setSavingMeal] = useState<{ meal: Meal; entries: LogEntry[] } | null>(null)
  const dayReadings = readingsOn(date)
  const shownReadings = dayReadings.filter((r) => r.kind !== 'water')
  const waterOz = dayReadings.filter((r) => r.kind === 'water').reduce((s, r) => s + (r.value ?? 0), 0)
  const [exerciseSheet, setExerciseSheet] = useState<{ exercise?: Exercise } | null>(null)
  const sessions = exercisesOn(date)
  const [editing, setEditing] = useState<{
    entry: LogEntry
    food: Food | NewFood
  } | null>(null)
  const [editingFood, setEditingFood] = useState<Food | NewFood | null>(null)
  const entries = logsOn(date)
  const total = useMemo(() => addNutrients(entries.map((e) => e.nutrients)), [entries])
  const today = localDate()
  const label =
    date === today
      ? 'Today'
      : date === shiftDate(today, -1)
        ? 'Yesterday'
        : new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })

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
        <h2>{label}</h2>
        <div className="header-actions three">
          <button type="button" className="btn secondary" onClick={() => setReadingSheet({})}>
            + Reading
          </button>
          <button type="button" className="btn secondary" onClick={() => setExerciseSheet({})}>
            + Exercise
          </button>
          <button type="button" className="btn" onClick={() => onAdd(date)}>
            + Food
          </button>
        </div>
        <MacroStrip n={total} />

        {entries.length === 0 && sessions.length === 0 && dayReadings.length === 0 && (
          <p className="muted small">Nothing logged for this day yet.</p>
        )}
        {(shownReadings.length > 0 || waterOz > 0) && (
          <div>
            <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Readings</span>
              {waterOz > 0 && (
                <span>
                  {waterOz / 8} {waterOz === 8 ? 'cup' : 'cups'} water ({waterOz} oz)
                </span>
              )}
            </div>
            <div className="list">
              {shownReadings.map((r) => (
                <button key={r.id} type="button" className="list-item" onClick={() => setReadingSheet({ reading: r })}>
                  <span className="grow">
                    <span className="title" style={{ display: 'block' }}>
                      {readingText(r, weightUnit)}
                    </span>
                    <span className="sub" style={{ display: 'block' }}>
                      {new Date(r.taken_at).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      {r.kind === 'blood_ketone' || r.kind === 'glucose' || r.kind === 'urine_ketone'
                        ? ` · ${CONTEXTS.find((c) => c.value === r.context)?.label.toLowerCase()}`
                        : ''}
                      {r.note ? ` · ${r.note}` : ''}
                    </span>
                  </span>
                  {r.kind === 'blood_ketone' && r.meta.predictedLow != null && (
                    <span className="right sub">
                      est. {r.meta.predictedLow}–{r.meta.predictedHigh}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        {sessions.length > 0 && (
          <div>
            <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Exercise</span>
              <span>{sessions.reduce((sum, e) => sum + (e.calories ?? 0), 0)} active kcal</span>
            </div>
            <div className="list">
              {sessions.map((e) => {
                return (
                  <button key={e.id} type="button" className="list-item" onClick={() => setExerciseSheet({ exercise: e })}>
                    <span className="grow">
                      <span className="title" style={{ display: 'block' }}>
                        {sessionLabel(e)} · {e.duration_min} min
                      </span>
                      <span className="sub" style={{ display: 'block' }}>
                        {new Date(e.started_at).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}{' '}
                        · {e.intensity === 'low' ? 'easy' : e.intensity === 'high' ? 'hard' : 'moderate'}
                        {e.meta.fasted ? ' · fasted' : ''}
                        {e.meta.lifts?.length ? ` · ${e.meta.lifts.map((l) => l.name).join(', ')}` : ''}
                        {e.note ? ` · ${e.note}` : ''}
                      </span>
                    </span>
                    <span className="right">
                      {e.meta.caloriesEstimated ? '~' : ''}
                      {e.calories ?? 0} kcal
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {MEALS.map((m) => {
          const items = entries.filter((e) => e.meal === m.value)
          if (!items.length) return null
          const sub = addNutrients(items.map((e) => e.nutrients))
          return (
            <div key={m.value}>
              <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  {m.label}{' '}
                  <button type="button" className="link-btn save-meal-btn" onClick={() => setSavingMeal({ meal: m.value, entries: items })}>
                    Save as meal
                  </button>
                </span>
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
                    onClick={() =>
                      setEditing({
                        entry: e,
                        food: (e.food_id && foodById[e.food_id]) || foodFromEntry(e),
                      })
                    }
                  >
                    <span className="grow">
                      <span className="title" style={{ display: 'block' }}>
                        {e.food_name}
                      </span>
                      <span className="sub" style={{ display: 'block' }}>
                        {formatAmount(e.amount, e.unit)} ·{' '}
                        {new Date(e.eaten_at).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
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
      {savingMeal && <SaveMealSheet entries={savingMeal.entries} meal={savingMeal.meal} onClose={() => setSavingMeal(null)} />}
      {readingSheet && (
        <ReadingSheet
          weightUnit={weightUnit}
          netCarbLimit={netCarbLimit}
          proteinTarget={proteinTarget}
          reading={readingSheet.reading}
          date={date}
          onClose={() => setReadingSheet(null)}
        />
      )}
      {exerciseSheet && (
        <ExerciseSheet weightKg={weightKg} exercise={exerciseSheet.exercise} date={date} onClose={() => setExerciseSheet(null)} />
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
