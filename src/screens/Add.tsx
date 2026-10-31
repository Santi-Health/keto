import { useCallback, useState } from 'react'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { ClaudeChatSheet } from '../components/ClaudeChatSheet'
import { FoodForm } from '../components/FoodForm'
import { FoodRow } from '../components/FoodRow'
import { LogFoodSheet, type AddMode } from '../components/LogFoodSheet'
import { RecipeBuilder } from '../components/RecipeBuilder'
import { LogSavedMealSheet } from '../components/SavedMealSheets'
import { useData } from '../lib/data'
import { lookupBarcode } from '../lib/foodApi'
import type { RestaurantDish } from '../lib/foodJson'
import { MEALS, mealForTime, setUsual, suggestForMeal, type Food, type Meal, type NewFood } from '../lib/foods'
import { mealTotals, type SavedMeal } from '../lib/savedMeals'
import { useFoodSearch } from '../lib/useFoodSearch'

type Overlay =
  | { kind: 'log'; food: Food | NewFood }
  | { kind: 'form'; food?: Food | NewFood; barcode?: string }
  | { kind: 'scan' }
  | { kind: 'recipe'; recipe?: Food; dish?: RestaurantDish }
  | { kind: 'claude'; mode?: 'label' | 'restaurant' }
  | { kind: 'meal'; savedMeal: SavedMeal }
  | null

interface Props {
  /** Open the camera scanner right away (from the Today quick-add button). */
  startScan?: boolean
  /** Open the Claude chat import right away (from the Today quick-add button). */
  startClaude?: boolean
  /** Day to log on (YYYY-MM-DD), when adding to a past day from the Log screen. */
  date?: string
  onLogged: () => void
}

export function Add({ startScan, startClaude, date, onLogged }: Props) {
  const { foods, logs, updateFood, savedMeals, foodById } = useData()
  const [meal, setMeal] = useState<Meal>(() => mealForTime(new Date()))
  const mealLabel = MEALS.find((m) => m.value === meal)!.label
  const usual = suggestForMeal(foods, logs, meal)
  const [query, setQuery] = useState('')
  const { q, mine, results, searching, error } = useFoodSearch(query, 40)
  // Meals saved for this slot first, then by how often they're used.
  const meals = [...savedMeals].sort(
    (a, b) => Number(b.meta.meal === meal) - Number(a.meta.meal === meal) || b.use_count - a.use_count || a.name.localeCompare(b.name),
  )
  const recipes = foods.filter((f) => f.source === 'recipe').sort((a, b) => a.name.localeCompare(b.name))
  const [overlay, setOverlay] = useState<Overlay>(startScan ? { kind: 'scan' } : startClaude ? { kind: 'claude' } : null)
  const [notice, setNotice] = useState<string | null>(null)
  // Log it, save it for later (a recipe ingredient, tonight's dinner), or just look (at the supermarket).
  const [mode, setMode] = useState<AddMode>('log')
  const savedOnly = (food: Food) => {
    setOverlay(null)
    setNotice(`Saved ${food.name} to My Foods. Nothing was logged.`)
  }

  const onDetected = useCallback(
    async (code: string) => {
      const clean = code.replace(/\D/g, '')
      const existing = foods.find((f) => f.barcode === clean)
      if (existing) return setOverlay({ kind: 'log', food: existing })
      setOverlay(null)
      setNotice(`Looking up ${clean}…`)
      try {
        const found = await lookupBarcode(clean)
        setNotice(null)
        if (found) setOverlay({ kind: 'log', food: found })
        else {
          setNotice(`Barcode ${clean} isn't in the food databases yet. Enter it from the label and it will be remembered.`)
          setOverlay({ kind: 'form', barcode: clean })
        }
      } catch {
        setNotice("Couldn't look up the barcode (offline?). You can enter the food from the label.")
        setOverlay({ kind: 'form', barcode: clean })
      }
    },
    [foods],
  )

  const close = useCallback(() => setOverlay(null), [])
  const logged = () => {
    setQuery('')
    onLogged()
  }

  return (
    <>
      <header className="page-header">
        <h1>{mode === 'log' ? 'Add food' : mode === 'save' ? 'Save a food' : 'Look up a food'}</h1>
        {date && (
          <span className="badge">
            to {new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        )}
      </header>

      <div className="card">
        <div className="segmented" role="group" aria-label="What to do" style={{ marginBottom: 12 }}>
          {(
            [
              ['log', 'Log it'],
              ['save', 'Save only'],
              ['look', 'Just look'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)}>
              {l}
            </button>
          ))}
        </div>
        {mode !== 'log' && (
          <p className="muted small" style={{ marginTop: -4 }}>
            {mode === 'save'
              ? 'Foods you open here are saved to My Foods without logging: for a recipe, or something you\u2019ll eat later.'
              : 'See the nutrition of anything you search or scan. Nothing is logged; save it if you buy it.'}
          </p>
        )}
        {mode === 'log' && (
        <div className="field" style={{ marginBottom: 12 }}>
          <span className="label">Logging to</span>
          <div className="segmented meal-picker" role="group" aria-label="Meal">
            {MEALS.map((m) => (
              <button key={m.value} type="button" aria-pressed={meal === m.value} onClick={() => setMeal(m.value)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        )}
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            placeholder="Search foods, e.g. avocado, Kerrygold butter"
            aria-label="Search foods"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus={!startScan && !startClaude}
          />
        </div>
        <div className="quick" style={{ marginTop: 10 }}>
          <button type="button" onClick={() => setOverlay({ kind: 'scan' })} style={{ color: 'var(--text)' }}>
            Scan barcode
          </button>
          <button type="button" onClick={() => setOverlay({ kind: 'form' })} style={{ color: 'var(--text)' }}>
            Enter from label
          </button>
          <button type="button" onClick={() => setOverlay({ kind: 'recipe' })} style={{ color: 'var(--text)' }}>
            New recipe
          </button>
          <button type="button" onClick={() => setOverlay({ kind: 'claude', mode: 'label' })} style={{ color: 'var(--text)' }}>
            Label photo (Claude)
          </button>
          <button type="button" onClick={() => setOverlay({ kind: 'claude', mode: 'restaurant' })} style={{ color: 'var(--text)' }}>
            Restaurant (Claude)
          </button>
        </div>
        {notice && <p className="notice small" style={{ marginBottom: 0 }}>{notice}</p>}

        {!q && (
          <>
            <div className="section-label">Saved meals</div>
            {meals.length ? (
              <div className="food-grid">
                {meals.map((m) => {
                  const t = mealTotals(m.items, foodById)
                  return (
                    <button key={m.id} type="button" className="saved-meal" onClick={() => setOverlay({ kind: 'meal', savedMeal: m })}>
                      <b>{m.name}</b>
                      <span className="muted small">
                        {m.items.map((i) => (i.foodId && foodById[i.foodId]?.name) || i.food.name).join(' · ')}
                      </span>
                      <span className="small">
                        {Math.round(t.kcal)} kcal · {t.netCarbs.toFixed(1)} g net · {Math.round(t.protein)} g protein
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="muted small">None yet. On the Log tab, tap "Save as meal" next to any meal to reuse it in one tap.</p>
            )}

            <div className="section-label">Usual for {mealLabel.toLowerCase()}</div>
            {usual.length ? (
              <div className="food-grid">
                {usual.map((f) => (
                  <FoodRow
                    key={f.id}
                    food={f}
                    onPick={() => setOverlay({ kind: 'log', food: f })}
                    onDismiss={() => updateFood({ ...f, meta: setUsual(f.meta, meal, false) })}
                    dismissLabel={`Not usual for ${mealLabel.toLowerCase()}`}
                  />
                ))}
              </div>
            ) : (
              <p className="muted small">
                Nothing yet. Foods you log at {mealLabel.toLowerCase()} show up here, or tag a food with its usual meals when you log it.
              </p>
            )}
          </>
        )}

        {!q && recipes.length > 0 && (
          <>
            <div className="section-label">My recipes</div>
            <div className="food-grid">
              {recipes.map((f) => (
                <FoodRow key={f.id} food={f} onPick={() => setOverlay({ kind: 'log', food: f })} />
              ))}
            </div>
          </>
        )}

        <div className="section-label">{q ? 'My foods' : 'My foods: favorites and most used'}</div>
        {mine.length ? (
          <div className="food-grid">
            {(q ? mine : mine.filter((f) => f.source !== 'recipe')).map((f) => (
              <FoodRow key={f.id} food={f} onPick={() => setOverlay({ kind: 'log', food: f })} />
            ))}
          </div>
        ) : (
          <p className="muted small">
            {q ? 'No saved foods match.' : 'Foods you log show up here, with favorites and the ones you use most at the top.'}
          </p>
        )}

        {q.length >= 3 && (
          <>
            <div className="section-label">USDA food database</div>
            {searching && <p className="muted small">Searching…</p>}
            {error && <p className="notice small">{error}</p>}
            {!searching && !error && !results.length && <p className="muted small">No matches. Try fewer words, or enter it from the label.</p>}
            <div className="food-grid">
              {results.map((f) => (
                <FoodRow key={f.meta.externalId} food={f} onPick={() => setOverlay({ kind: 'log', food: f })} />
              ))}
            </div>
          </>
        )}
      </div>

      {overlay?.kind === 'scan' && <BarcodeScanner onDetected={onDetected} onClose={close} />}
      {overlay?.kind === 'log' && (
        <LogFoodSheet
          food={overlay.food}
          date={date}
          meal={meal}
          onClose={close}
          onDone={logged}
          mode={mode}
          onSavedFood={savedOnly}
          onEditFood={(food) =>
            setOverlay('id' in food && food.source === 'recipe' ? { kind: 'recipe', recipe: food } : { kind: 'form', food })
          }
        />
      )}
      {overlay?.kind === 'recipe' && (
        <RecipeBuilder recipe={overlay.recipe} dish={overlay.dish} onClose={close} onSaved={(food) => (mode === 'save' ? savedOnly(food) : setOverlay({ kind: 'log', food }))} />
      )}
      {overlay?.kind === 'meal' && (
        <LogSavedMealSheet savedMeal={overlay.savedMeal} date={date} meal={meal} onClose={close} onDone={logged} />
      )}
      {overlay?.kind === 'claude' && (
        <ClaudeChatSheet
          initialMode={overlay.mode}
          onClose={close}
          onFood={(food) => setOverlay({ kind: 'form', food })}
          onDish={(dish) => setOverlay({ kind: 'recipe', dish })}
        />
      )}
      {overlay?.kind === 'form' && (
        <FoodForm
          food={overlay.food}
          barcode={overlay.barcode}
          onClose={close}
          onSaved={(food) => {
            setNotice(null)
            if (mode === 'save') savedOnly(food)
            else setOverlay({ kind: 'log', food })
          }}
        />
      )}
    </>
  )
}
