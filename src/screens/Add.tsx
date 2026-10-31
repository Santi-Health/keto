import { useCallback, useState } from 'react'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { FoodForm } from '../components/FoodForm'
import { FoodRow } from '../components/FoodRow'
import { LogFoodSheet } from '../components/LogFoodSheet'
import { RecipeBuilder } from '../components/RecipeBuilder'
import { useData } from '../lib/data'
import { lookupBarcode } from '../lib/foodApi'
import { MEALS, mealForTime, suggestForMeal, type Food, type Meal, type NewFood } from '../lib/foods'
import { useFoodSearch } from '../lib/useFoodSearch'

type Overlay =
  | { kind: 'log'; food: Food | NewFood }
  | { kind: 'form'; food?: Food | NewFood; barcode?: string }
  | { kind: 'scan' }
  | { kind: 'recipe'; recipe?: Food }
  | null

interface Props {
  /** Open the camera scanner right away (from the Today quick-add button). */
  startScan?: boolean
  /** Day to log on (YYYY-MM-DD), when adding to a past day from the Log screen. */
  date?: string
  onLogged: () => void
}

export function Add({ startScan, date, onLogged }: Props) {
  const { foods, logs } = useData()
  const [meal, setMeal] = useState<Meal>(() => mealForTime(new Date()))
  const mealLabel = MEALS.find((m) => m.value === meal)!.label
  const usual = suggestForMeal(foods, logs, meal)
  const [query, setQuery] = useState('')
  const { q, mine, results, searching, error } = useFoodSearch(query, 40)
  const recipes = foods.filter((f) => f.source === 'recipe').sort((a, b) => a.name.localeCompare(b.name))
  const [overlay, setOverlay] = useState<Overlay>(startScan ? { kind: 'scan' } : null)
  const [notice, setNotice] = useState<string | null>(null)

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
        <h1>Add food</h1>
        {date && (
          <span className="badge">
            to {new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        )}
      </header>

      <div className="card">
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
            autoFocus={!startScan}
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
        </div>
        {notice && <p className="notice small" style={{ marginBottom: 0 }}>{notice}</p>}

        {!q && (
          <>
            <div className="section-label">Usual for {mealLabel.toLowerCase()}</div>
            {usual.length ? (
              <div className="food-grid">
                {usual.map((f) => (
                  <FoodRow key={f.id} food={f} onPick={() => setOverlay({ kind: 'log', food: f })} />
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
          onEditFood={(food) =>
            setOverlay('id' in food && food.source === 'recipe' ? { kind: 'recipe', recipe: food } : { kind: 'form', food })
          }
        />
      )}
      {overlay?.kind === 'recipe' && (
        <RecipeBuilder recipe={overlay.recipe} onClose={close} onSaved={(food) => setOverlay({ kind: 'log', food })} />
      )}
      {overlay?.kind === 'form' && (
        <FoodForm
          food={overlay.food}
          barcode={overlay.barcode}
          onClose={close}
          onSaved={(food) => {
            setNotice(null)
            setOverlay({ kind: 'log', food })
          }}
        />
      )}
    </>
  )
}
