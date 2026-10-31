import { useEffect, useRef, useState } from 'react'
import { useData } from '../lib/data'
import { searchUsda } from '../lib/foodApi'
import type { RestaurantDish } from '../lib/foodJson'
import type { Food, NewFood } from '../lib/foods'
import { bestIngredientMatch, computeRecipe, isOffTarget, parseIngredientLine, recipeToFood, resolveAmount, type RecipeIngredient } from '../lib/recipes'
import { toGrams, unitsFor } from '../lib/units'
import { matchMyFoods } from '../lib/useFoodSearch'
import { MERCURY_PPM } from '../lib/watchlist'
import { MacroStrip } from './FoodBits'
import { FoodPicker } from './FoodPicker'
import { Sheet } from './Sheet'

interface Props {
  /** An existing recipe to edit; omit to start a new one. */
  recipe?: Food
  /** A restaurant dish estimated by Claude: its ingredients are matched right away and the result is marked estimated. */
  dish?: RestaurantDish
  onClose: () => void
  onSaved: (food: Food) => void
}

interface Row {
  key: string
  raw?: string
  query: string
  /** Parsed amount before a food is matched. */
  parsed?: { amount: number; unit: string | null }
  food: NewFood | null
  foodId: string | null
  amount: number
  unit: string
  guessed: boolean
  status: 'matching' | 'ready' | 'nomatch'
  note?: string
}

/** A food without its saved-row fields, as stored inside a recipe. */
function snapshot(f: Food | NewFood): NewFood {
  if (!('id' in f)) return f
  const { id: _id, favorite: _fav, use_count: _uc, last_used_at: _lu, updated_at: _ua, deleted_at: _da, ...rest } = f
  void [_id, _fav, _uc, _lu, _ua, _da]
  return rest
}

let keySeq = 0
const nextKey = () => `r${++keySeq}`

export function RecipeBuilder({ recipe, dish, onClose, onSaved }: Props) {
  const { foods, saveFood } = useData()
  const existing = recipe?.meta.recipe
  const [name, setName] = useState(recipe?.name ?? (dish ? (dish.restaurant ? `${dish.name} (${dish.restaurant})` : dish.name) : ''))
  const [servings, setServings] = useState(String(existing?.servings ?? (dish ? 1 : 2)))
  const [cooked, setCooked] = useState(existing?.cookedWeightG ? String(existing.cookedWeightG) : '')
  const [paste, setPaste] = useState(dish ? dish.ingredients.join('\n') : '')
  const [rows, setRows] = useState<Row[]>(() =>
    (existing?.ingredients ?? []).map((i) => ({
      key: nextKey(),
      raw: i.raw,
      query: i.food.name,
      food: i.food,
      foodId: i.foodId,
      amount: i.amount,
      unit: i.unit,
      guessed: !!i.guessed,
      status: 'ready' as const,
    })),
  )
  const [picking, setPicking] = useState<{ rowKey: string | null; query: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const update = (key: string, change: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)))

  function setFood(key: string, f: Food | NewFood, parsed?: { amount: number; unit: string | null }, query = '') {
    const row = rows.find((r) => r.key === key)
    const p = parsed ?? row?.parsed ?? { amount: row?.amount ?? 100, unit: row?.unit ?? 'g' }
    const r = resolveAmount(f, { amount: p.amount, unit: p.unit, query: query || row?.query || f.name })
    update(key, { food: snapshot(f), foodId: 'id' in f ? f.id : null, amount: r.amount, unit: r.unit, guessed: r.guessed, status: 'ready', note: undefined })
  }

  // A dish from Claude arrives with its ingredients filled in: match them right away.
  const started = useRef(false)
  useEffect(() => {
    if (dish && !started.current) {
      started.current = true
      void findIngredients()
    }
  }, [])

  /** Parses the pasted lines and matches each to My Foods first, then USDA (generic foods first). */
  async function findIngredients() {
    const lines = paste.split(/\n|;/).map(parseIngredientLine).filter((p): p is NonNullable<typeof p> => !!p)
    if (!lines.length) return
    const added: Row[] = lines.map((p) => ({
      key: nextKey(),
      raw: p.raw,
      query: p.query,
      parsed: { amount: p.amount, unit: p.unit },
      food: null,
      foodId: null,
      amount: p.amount,
      unit: p.unit ?? 'g',
      guessed: false,
      status: 'matching',
    }))
    setRows((rs) => [...rs, ...added])
    setPaste('')
    // One at a time, to stay inside the USDA rate limit.
    for (const row of added) {
      // A saved food wins only if it's the same product (not "egg white" for "eggs").
      const local = bestIngredientMatch(row.query, matchMyFoods(foods, row.query, 10).filter((f) => !isOffTarget(row.query, f.name)))
      let match: Food | NewFood | undefined = local
      let note: string | undefined
      if (!match) {
        try {
          match = bestIngredientMatch(row.query, await searchUsda(row.query, undefined, { ingredients: true }))
        } catch (e) {
          note = (e as Error).message
        }
      }
      setRows((rs) =>
        rs.map((r) => {
          if (r.key !== row.key) return r
          if (!match) return { ...r, status: 'nomatch', note: note ?? `No match for "${row.query}". Tap Choose to search.` }
          const res = resolveAmount(match, { amount: row.parsed!.amount, unit: row.parsed!.unit, query: row.query })
          return {
            ...r,
            food: snapshot(match),
            foodId: 'id' in match ? match.id : null,
            amount: res.amount,
            unit: res.unit,
            guessed: res.guessed,
            status: 'ready',
          }
        }),
      )
    }
  }

  const ready = rows.filter((r): r is Row & { food: NewFood } => r.status === 'ready' && !!r.food)
  const ingredients: RecipeIngredient[] = ready.map((r) => ({
    food: r.food,
    foodId: r.foodId,
    amount: r.amount,
    unit: r.unit,
    raw: r.raw,
    guessed: r.guessed,
  }))
  const nServings = Math.max(1, Number(servings) || 1)
  const cookedG = Number(cooked) > 0 ? Number(cooked) : null
  const totals = ingredients.length ? computeRecipe(ingredients, nServings, cookedG) : null

  function save() {
    if (!name.trim()) return setError('Give the recipe a name.')
    if (!ingredients.length) return setError('Add at least one ingredient.')
    if (rows.some((r) => r.status === 'matching')) return setError('Still matching ingredients, one moment.')
    // Keep ingredients in My Foods so they're instant next time.
    const withIds = ingredients.map((i) => {
      if (i.foodId) return i
      const saved = saveFood(i.food)
      return { ...i, foodId: saved.id }
    })
    const food = recipeToFood(name, { servings: nServings, cookedWeightG: cookedG, ingredients: withIds }, recipe)
    if (dish) {
      // Restaurant portions are guesses: mark the dish estimated so its logs show "~".
      food.confidence = dish.confidence
      food.fields_estimated = ['restaurant portions']
      food.keto_notes = [dish.hiddenCarbs.length ? `Possible hidden carbs: ${dish.hiddenCarbs.join('; ')}.` : '', dish.notes ?? ''].filter(Boolean).join(' ') || null
    }
    onSaved(saveFood(food))
  }

  const mercury = totals?.perServing.mercuryUg
  const fishNames = [...new Set(ingredients.flatMap((i) => (i.food.meta.fishSpecies ? [MERCURY_PPM[i.food.meta.fishSpecies].label] : [])))]

  return (
    <Sheet
      title={recipe ? 'Edit recipe' : dish ? 'Restaurant dish' : 'New recipe'}
      subtitle={dish ? `Claude's estimate (${dish.confidence} confidence): adjust portions, then save` : 'List the ingredients; the app does the math'}
      onClose={onClose}
    >
      {dish && (dish.hiddenCarbs.length > 0 || dish.menuCalories != null) && (
        <div className="notice small">
          {dish.hiddenCarbs.length > 0 && <div>Watch for hidden carbs: {dish.hiddenCarbs.join('; ')}.</div>}
          {dish.menuCalories != null && (
            <div>
              Menu says {dish.menuCalories} kcal
              {totals ? `; these ingredients add up to ${Math.round(totals.perServing.kcal ?? 0) * nServings} kcal.` : '.'}
            </div>
          )}
        </div>
      )}
      <div className="field">
        <label htmlFor="rb-name">Recipe name</label>
        <input id="rb-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Salmon with butter and asparagus" />
      </div>

      <div className="field">
        <label htmlFor="rb-paste">Ingredients, one per line</label>
        <textarea
          id="rb-paste"
          rows={5}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={'200 g chicken thigh\n2 eggs\n1 tbsp olive oil\n½ avocado\n1 cup spinach'}
        />
        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => void findIngredients()} disabled={!paste.trim()}>
            Find ingredients
          </button>
          <button type="button" className="btn secondary" onClick={() => setPicking({ rowKey: null, query: '' })}>
            + Add one by search
          </button>
        </div>
        <div className="hint">Works with g, kg, oz, lb, ml, cups, tbsp, tsp, fractions like ½, and counts like "2 eggs".</div>
      </div>

      {rows.length > 0 && <div className="section-label">Ingredients</div>}
      {rows.map((r) => {
        const grams = r.food ? safeGrams(r) : null
        const kcal = r.food && grams != null ? ((r.food.per_100g.kcal ?? 0) * grams) / 100 : null
        const net = r.food && grams != null ? ((r.food.per_100g.netCarbs ?? 0) * grams) / 100 : null
        return (
          <div key={r.key} className="ingredient">
            <div className="ingredient-head">
              <div style={{ minWidth: 0 }}>
                <div className="title">
                  {r.status === 'matching' ? `Finding "${r.query}"…` : r.food ? r.food.name : `"${r.query}"`}
                </div>
                {r.raw && <div className="muted small">from: {r.raw}</div>}
              </div>
              <button type="button" className="icon-btn" aria-label="Remove ingredient" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>
                ×
              </button>
            </div>
            {r.status === 'nomatch' && <p className="notice small">{r.note}</p>}
            {r.food && (
              <div className="row">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  aria-label="Amount"
                  value={r.amount}
                  onChange={(e) => update(r.key, { amount: Number(e.target.value), guessed: false })}
                />
                <select aria-label="Unit" value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value, guessed: false })} style={{ flex: 1.4 }}>
                  {unitsFor({ unitConversions: r.food.unit_conversions }).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="row" style={{ marginTop: 6, justifyContent: 'space-between' }}>
              <span className="muted small" style={{ flex: 'none' }}>
                {grams != null && `${grams.toFixed(0)} g · ${kcal!.toFixed(0)} kcal · ${net!.toFixed(1)} g net`}
                {r.guessed && <span className="chip warn" style={{ marginLeft: 6 }}>check amount</span>}
              </span>
              <button type="button" className="link" style={{ margin: 0, flex: 'none' }} onClick={() => setPicking({ rowKey: r.key, query: r.query })}>
                {r.food ? 'Change food' : 'Choose'}
              </button>
            </div>
          </div>
        )
      })}

      <div className="section-label">Batch</div>
      <div className="row">
        <div className="field">
          <label htmlFor="rb-serv">Servings</label>
          <input id="rb-serv" type="number" inputMode="decimal" min={1} value={servings} onChange={(e) => setServings(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rb-cooked">Cooked weight (optional)</label>
          <div className="row">
            <input id="rb-cooked" type="number" inputMode="decimal" value={cooked} onChange={(e) => setCooked(e.target.value)} placeholder={totals ? totals.rawGrams.toFixed(0) : ''} />
            <span className="muted small" style={{ flex: 'none' }}>g</span>
          </div>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: -6 }}>
        Weigh the finished dish if you can: cooking loses water, so per-gram numbers are more accurate.
      </p>

      {totals && (
        <div className="card" style={{ background: 'var(--surface-2)', border: 0 }}>
          <h2 style={{ marginBottom: 0 }}>Per serving</h2>
          <MacroStrip n={totals.perServing} estimated={totals.approximate} />
          <p className="small" style={{ margin: 0 }}>
            {totals.servingGrams.toFixed(0)} g per serving · whole recipe {Math.round(totals.total.kcal)} kcal,{' '}
            {totals.total.netCarbs.toFixed(1)} g net carbs, {Math.round(totals.total.protein)} g protein
          </p>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Per serving: sodium {Math.round(totals.perServing.sodiumMg ?? 0)} mg · potassium {Math.round(totals.perServing.potassiumMg ?? 0)} mg ·
            sat fat {(totals.perServing.satFat ?? 0).toFixed(1)} g · fiber {(totals.perServing.fiber ?? 0).toFixed(1)} g
            {mercury ? ` · ~${mercury.toFixed(0)} µg mercury (${fishNames.join(', ')})` : ''}
            {totals.perServing.processedMeatG ? ` · ${Math.round(totals.perServing.processedMeatG)} g processed meat` : ''}
          </p>
          {totals.approximate && <p className="muted small" style={{ marginBottom: 0 }}>~ Some amounts are estimates; check the ones marked.</p>}
        </div>
      )}

      {error && <p className="notice" role="alert">{error}</p>}
      <div className="row" style={{ marginTop: 14 }}>
        <button type="button" className="btn" onClick={save}>
          Save recipe
        </button>
      </div>

      {picking && (
        <FoodPicker
          title={picking.rowKey ? 'Choose ingredient' : 'Add ingredient'}
          initialQuery={picking.query}
          onClose={() => setPicking(null)}
          onPick={(f) => {
            if (picking.rowKey) setFood(picking.rowKey, f)
            else {
              const key = nextKey()
              const res = resolveAmount(f, { amount: 100, unit: 'g', query: f.name })
              setRows((rs) => [
                ...rs,
                { key, query: f.name, food: snapshot(f), foodId: 'id' in f ? f.id : null, amount: res.amount, unit: res.unit, guessed: false, status: 'ready' },
              ])
            }
            setPicking(null)
          }}
        />
      )}
    </Sheet>
  )
}

function safeGrams(r: Row): number | null {
  try {
    return toGrams({ unitConversions: r.food!.unit_conversions }, r.amount || 0, r.unit).grams
  } catch {
    return null
  }
}
