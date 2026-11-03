import { useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { MEALS, portionNutrients, type Food, type LogEntry, type Meal } from '../lib/foods'
import { SECTIONS, nutCount, pairsFor, portionText, saltKind, sectionsOf, servingOf, setPortionOf, shortName, unshout } from '../lib/quickFoods'
import type { SavedMeal } from '../lib/savedMeals'
import { toGrams, unitsFor } from '../lib/units'
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

const SALT_KEY = 'keto.lastSalt'
/** The salt (or NuSalt, or both) used in the last log that had one, on this phone. */
function lastSalt(): string[] | null {
  try {
    return JSON.parse(localStorage.getItem(SALT_KEY) ?? 'null')
  } catch {
    return null
  }
}
function rememberSalt(kinds: string[]) {
  try {
    localStorage.setItem(SALT_KEY, JSON.stringify(kinds))
  } catch {
    // Private mode: every log starts with both.
  }
}

/**
 * Tap a food button: its full name, how many portions (one by default, any number typed), the foods that
 * go with it, what that adds, and Log. Other amounts, editing, renaming the button and its section are one tap further.
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
  /** Everything logged by the tap: the food first, then the foods that go with it. */
  onLogged: (entries: LogEntry[], text: string) => void
  /** Open the full log sheet (any amount or unit, time, usual meals). */
  onMore: () => void
  onEdit: () => void
  onClose: () => void
}) {
  const { foods, logFood, updateFood } = useData()
  const serving = servingOf(food)
  const [times, setTimes] = useState('1')
  const steps = Number(times) > 0 ? Number(times) : 0
  const pairs = useMemo(() => pairsFor(food, foods), [food, foods])
  /** Pairings left out of this one log: to start, the salt you didn't use last time (NuSalt at home, salt away). */
  const [skipped, setSkipped] = useState<string[]>(() => {
    const last = lastSalt()
    return last ? pairs.filter((p) => saltKind(p) && !last.includes(saltKind(p)!)).map((p) => p.id) : []
  })
  const [pairing, setPairing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(shortName(food))
  const setPortion = setPortionOf(food)
  const [portioning, setPortioning] = useState(false)
  const [portionAmount, setPortionAmount] = useState(String(setPortion?.amount ?? serving.amount))
  const [portionUnit, setPortionUnit] = useState(setPortion?.unit ?? serving.unit)
  const labelServing = food.unit_conversions[0]
  const amount = serving.amount * steps
  const grams = toGrams({ unitConversions: food.unit_conversions }, amount, serving.unit).grams
  const own = useMemo(() => portionNutrients(food, grams), [food, grams])
  const portion = portionLabel(food, amount, serving.unit)
  const mealLabel = MEALS.find((m) => m.value === meal)!.label.toLowerCase()
  const sections = sectionsOf(food)
  const fmt = (v: number | undefined, d = 0) => (v == null ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString())

  const withIt = pairs.filter((p) => !skipped.includes(p.id))
  // What the whole tap adds, pairings included.
  const n = { ...own }
  for (const p of withIt) {
    const pn = portionNutrients(p, toGrams({ unitConversions: p.unit_conversions }, servingOf(p).amount, servingOf(p).unit).grams)
    for (const k of ['kcal', 'netCarbs', 'protein', 'fat'] as const) if (pn[k] != null) n[k] = (n[k] ?? 0) + pn[k]
  }
  // Same time for all, so they read as one entry.
  function log() {
    const at = defaultTime(date)
    const entries = [logFood(food, amount, serving.unit, meal, at)]
    for (const p of withIt) entries.push(logFood(p, servingOf(p).amount, servingOf(p).unit, meal, at))
    const salts = withIt.map(saltKind).filter((k) => k != null)
    if (salts.length) rememberSalt(salts)
    onLogged(entries, `${portion} ${shortName(food)}${withIt.length ? ` with ${withIt.map((p) => shortName(p)).join(', ')}` : ''}`)
  }

  function togglePair(id: string) {
    const ids = pairs.map((p) => p.id)
    updateFood({ ...food, meta: { ...food.meta, pairs: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] } })
  }
  /** Foods to choose pairings from: the current ones, then condiments, most used first. */
  const pairChoices = useMemo(
    () => [...pairs, ...foods.filter((f) => f.id !== food.id && !pairs.includes(f) && sectionsOf(f).includes('condiments')).sort((a, b) => b.use_count - a.use_count)],
    [pairs, foods, food.id],
  )

  function rename() {
    const clean = name.trim()
    updateFood({ ...food, meta: { ...food.meta, buttonName: clean && clean !== food.name ? clean : undefined } })
    setRenaming(false)
  }

  function savePortion(clear = false) {
    const amount = Number(portionAmount)
    const portion = clear || !(amount > 0) ? { amount: 0, unit: '' } : { amount, unit: portionUnit }
    updateFood({ ...food, meta: { ...food.meta, portion } })
    setTimes('1')
    setPortioning(false)
  }

  return (
    <Sheet title={unshout(food.name)} subtitle={food.brand ?? undefined} onClose={onClose}>
      <span className="label">
        How many portions
        {setPortion && labelServing && labelServing.unit !== setPortion.unit && ` · label serving: ${portionText(1, labelServing.unit)}`}
      </span>
      <div className="portion-times">
        <button type="button" aria-label="Less" onClick={() => setTimes(String(Math.max(0.5, Math.ceil(steps * 2 - 1) / 2)))}>
          −
        </button>
        <input aria-label="Number of portions" type="number" inputMode="decimal" min={0} step="any" value={times} onChange={(e) => setTimes(e.target.value)} onFocus={(e) => e.target.select()} />
        <button type="button" aria-label="More" onClick={() => setTimes(String(Math.floor(steps * 2 + 1) / 2))}>
          +
        </button>
        <span>
          × {portionText(serving.amount, serving.unit)}
          {steps !== 1 && steps > 0 && <b> = {portion}</b>}
        </span>
      </div>
      {pairs.length > 0 && !pairing && (
        <div className="section-chips pair-chips" role="group" aria-label="Goes with">
          <span className="muted small">With</span>
          {pairs.map((p) => {
            const on = !skipped.includes(p.id)
            return (
              <button key={p.id} type="button" className={`chip-btn ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setSkipped(on ? [...skipped, p.id] : skipped.filter((x) => x !== p.id))}>
                {on ? '✓ ' : ''}
                {shortName(p)} · {servingText(p)}
              </button>
            )
          })}
        </div>
      )}
      {pairing && (
        <div className="section-chips pair-chips" role="group" aria-label="Always log with">
          <span className="muted small">Always log with</span>
          {pairChoices.map((p) => {
            const on = pairs.includes(p)
            return (
              <button key={p.id} type="button" className={`chip-btn ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => togglePair(p.id)}>
                {shortName(p)}
              </button>
            )
          })}
          <button type="button" className="more-link" onClick={() => setPairing(false)}>
            Done
          </button>
        </div>
      )}
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
      <button type="button" className="btn" style={{ width: '100%' }} onClick={log} disabled={!steps}>
        Log {portion}
        {withIt.length ? ` + ${withIt.length}` : ''} to {mealLabel}
      </button>
      {renaming ? (
        <div className="row" style={{ marginTop: 10 }}>
          <input aria-label="Button name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <button type="button" className="btn secondary small-btn" onClick={rename}>
            Save
          </button>
        </div>
      ) : portioning ? (
        <div style={{ marginTop: 10 }}>
          <span className="label">Usual portion: what one tap logs</span>
          <div className="row">
            <input aria-label="Portion amount" type="number" inputMode="decimal" min={0} step="any" value={portionAmount} onChange={(e) => setPortionAmount(e.target.value)} />
            <select aria-label="Portion unit" value={portionUnit} onChange={(e) => setPortionUnit(e.target.value)}>
              {unitsFor({ unitConversions: food.unit_conversions }).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <button type="button" className="btn secondary small-btn" onClick={() => savePortion()}>
              Save
            </button>
          </div>
          {setPortion && (
            <button type="button" className="more-link" onClick={() => savePortion(true)}>
              Back to the label serving
            </button>
          )}
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
          <button type="button" onClick={() => setPortioning(true)}>
            Usual portion
          </button>
          <button type="button" onClick={() => setPairing(true)}>
            {pairs.length ? 'Change what goes with it' : 'Always log with…'}
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
