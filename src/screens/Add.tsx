import { useCallback, useMemo, useState } from 'react'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { DrinksCard } from '../components/DrinksCard'
import { ClaudeChatSheet } from '../components/ClaudeChatSheet'
import { FoodForm } from '../components/FoodForm'
import { FoodRow } from '../components/FoodRow'
import { LogFoodSheet, type AddMode } from '../components/LogFoodSheet'
import { FoodButtons, QuickLogSheet, type QuickItem } from '../components/QuickFoods'
import { RecipeBuilder } from '../components/RecipeBuilder'
import { LogSavedMealSheet } from '../components/SavedMealSheets'
import { useData } from '../lib/data'
import { lookupBarcode } from '../lib/foodApi'
import type { RestaurantDish } from '../lib/foodJson'
import { MEALS, mealForTime, rankFoods, suggestForMeal, type Food, type Meal, type NewFood } from '../lib/foods'
import { isDrinkFood } from '../lib/drinks'
import { SECTIONS, brandsToShow, sectionsOf, veryFrequentAt } from '../lib/quickFoods'
import type { SavedMeal } from '../lib/savedMeals'
import { localDate } from '../lib/targets'
import { useFoodSearch } from '../lib/useFoodSearch'

type Overlay =
  | { kind: 'log'; food: Food | NewFood }
  | { kind: 'quick'; food: Food }
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
  /** Daily fluid goal, for the drinks card at the bottom. */
  waterTargetOz: number
  onLogged: () => void
}

export function Add({ startScan, startClaude, date, waterTargetOz, onLogged }: Props) {
  const { foods, logs, savedMeals, foodById, logsOn, deleteLog } = useData()
  const [meal, setMeal] = useState<Meal>(() => mealForTime(new Date()))
  const mealLabel = MEALS.find((m) => m.value === meal)!.label
  const [query, setQuery] = useState('')
  const { q, mine, results, searching, error } = useFoodSearch(query, 40)
  // Meals saved for this slot first, then by how often they're used.
  const meals = [...savedMeals].sort((a, b) => b.use_count - a.use_count || a.name.localeCompare(b.name))
  // Buttons, from your own foods only: each meal's usual foods, then fruits & nuts, picada and condiments,
  // and everything folded at the bottom. Drinks have their own buttons on Today, so they're left out.
  const myFoods = useMemo(() => foods.filter((f) => !isDrinkFood(f)), [foods])
  const brands = useMemo(() => brandsToShow(myFoods), [myFoods])
  const bySection = useMemo(() => SECTIONS.map((sec) => ({ ...sec, list: rankFoods(myFoods.filter((f) => sectionsOf(f).includes(sec.key))) })), [myFoods])
  // A food with its own section shows with a meal too only when it's eaten there very often.
  const usualFor = (m: Meal) => suggestForMeal(myFoods, logs, m, 40).filter((f) => !sectionsOf(f).length || veryFrequentAt(f.id, m, logs))
  const counts: Record<string, number> = {}
  for (const l of logsOn(date ?? localDate())) if (l.meal === meal && l.food_id) counts[l.food_id] = (counts[l.food_id] ?? 0) + 1
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }))
  const [justLogged, setJustLogged] = useState<{ ids: string[]; text: string } | null>(null)
  const pick = (it: QuickItem) => {
    if (it.kind === 'meal') return setOverlay({ kind: 'meal', savedMeal: it.meal })
    setOverlay(mode === 'log' ? { kind: 'quick', food: it.food } : { kind: 'log', food: it.food })
  }
  const asItems = (fs: Food[]): QuickItem[] => fs.map((food) => ({ kind: 'food', food }))
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

        {justLogged && (
          <div className="small just-logged" role="status">
            <span>
              Logged {justLogged.text}.
            </span>
            <button type="button" className="btn secondary small-btn" onClick={() => {
                for (const id of justLogged.ids) deleteLog(id)
                setJustLogged(null)
              }}>
              Undo
            </button>
            <button type="button" className="btn small-btn" onClick={logged}>
              Done
            </button>
          </div>
        )}

        {!q && (
          <>
            <div className="section-label">{mealLabel}</div>
            {(() => {
              const usual = usualFor(meal)
              const shown = open[meal] ? usual : usual.slice(0, 9)
              const mealsHere = mode === 'log' ? meals.filter((m) => m.meta.meal === meal) : []
              const items = [...asItems(shown), ...mealsHere.map((m): QuickItem => ({ kind: 'meal', meal: m }))]
              return items.length ? (
                <>
                  <FoodButtons items={items} brands={brands} counts={counts} onPick={pick} />
                  {usual.length > 9 && (
                    <button type="button" className="more-link" onClick={() => toggle(meal)}>
                      {open[meal] ? 'Fewer' : `More ${mealLabel.toLowerCase()} foods ›`}
                    </button>
                  )}
                </>
              ) : (
                <p className="muted small">Nothing yet. Foods you log at {mealLabel.toLowerCase()} show up here as buttons.</p>
              )
            })()}

            {MEALS.filter((m) => m.value !== meal).map((m) => {
              const usual = usualFor(m.value)
              if (!usual.length) return null
              return (
                <div key={m.value}>
                  <button type="button" className="fold" aria-expanded={!!open[`fold-${m.value}`]} onClick={() => toggle(`fold-${m.value}`)}>
                    {m.label} <span>{open[`fold-${m.value}`] ? '▾' : `${Math.min(usual.length, 9)} foods ›`}</span>
                  </button>
                  {open[`fold-${m.value}`] && <FoodButtons items={asItems(usual.slice(0, 9))} brands={brands} counts={counts} onPick={pick} />}
                </div>
              )
            })}

            {bySection.map(({ key, title, list }) =>
              list.length ? (
                <div key={key}>
                  <div className="section-label">{title}</div>
                  <FoodButtons items={asItems(open[key] ? list : list.slice(0, 9))} brands={brands} counts={counts} onPick={pick} />
                  {list.length > 9 && (
                    <button type="button" className="more-link" onClick={() => toggle(key)}>
                      {open[key] ? 'Fewer' : `More ${title.toLowerCase()} ›`}
                    </button>
                  )}
                </div>
              ) : null,
            )}

            <button type="button" className="fold" style={{ marginTop: 12 }} aria-expanded={!!open.all} onClick={() => toggle('all')}>
              All my foods <span>{open.all ? '▾' : `${myFoods.length + (mode === 'log' ? meals.length : 0)} ›`}</span>
            </button>
            {open.all &&
              (myFoods.length ? (
                <FoodButtons
                  items={[...(mode === 'log' ? meals.map((m): QuickItem => ({ kind: 'meal', meal: m })) : []), ...asItems(rankFoods(myFoods))]}
                  brands={brands}
                  counts={counts}
                  onPick={pick}
                />
              ) : (
                <p className="muted small">Foods you save or log show up here.</p>
              ))}
          </>
        )}

        {q && (
          <>
            <div className="section-label">My foods</div>
            {mine.length ? (
              <div className="food-grid">
                {mine.map((f) => (
                  <FoodRow key={f.id} food={f} onPick={() => setOverlay({ kind: 'log', food: f })} />
                ))}
              </div>
            ) : (
              <p className="muted small">No saved foods match.</p>
            )}
          </>
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

      {/* Drinks keep their one-tap buttons, at the very bottom (today only, like on Today). */}
      {(!date || date === localDate()) && mode === 'log' && !q && (
        <div style={{ marginTop: 12 }}>
          <DrinksCard days={[localDate()]} waterTargetOz={waterTargetOz} />
        </div>
      )}

      {overlay?.kind === 'quick' && (
        <QuickLogSheet
          food={foodById[overlay.food.id] ?? overlay.food}
          meal={meal}
          date={date}
          onClose={close}
          onLogged={(entries, text) => {
            setOverlay(null)
            setJustLogged({ ids: entries.map((e) => e.id), text: `${text} to ${mealLabel.toLowerCase()}` })
          }}
          onMore={() => setOverlay({ kind: 'log', food: foodById[overlay.food.id] ?? overlay.food })}
          onEdit={() => {
            const f = foodById[overlay.food.id] ?? overlay.food
            setOverlay(f.source === 'recipe' ? { kind: 'recipe', recipe: f } : { kind: 'form', food: f })
          }}
        />
      )}
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
