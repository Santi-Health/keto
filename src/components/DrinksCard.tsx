import { useState } from 'react'
import { useData } from '../lib/data'
import { ALL_DRINKS, DRINKS, MILKS, asksForMilk, drinkFood, drinkPortion, milkFood, type Drink, type DrinkKey, type MilkKey } from '../lib/drinks'
import { portionNutrients, type Food } from '../lib/foods'
import { mealForTime } from '../lib/foods'
import { localDate } from '../lib/targets'
import { deviceTz } from '../lib/time'
import { Segmented } from './Fields'
import { Bar } from './Progress'
import { Sheet } from './Sheet'

interface Props {
  /** Days to show: one day, or a week (counts are totals, water is a daily average). */
  days: string[]
  waterTargetOz: number
}

type Undo = { kind: 'reading' | 'log'; ids: string[]; label: string }

/** One tap per drink. Water and sparkling water fill the water goal; the rest log caffeine, sodium and sweeteners. */
export function DrinksCard({ days, waterTargetOz }: Props) {
  const { readingsOn, saveReading, deleteReading, logsOn, deleteLog, foods, foodById, saveFood, logFood } = useData()
  const [undo, setUndo] = useState<Undo | null>(null)
  const [espresso, setEspresso] = useState<Drink | null>(null)
  const isToday = days.length === 1 && days[0] === localDate()
  const water = days.flatMap((d) => readingsOn(d)).filter((r) => r.kind === 'water')
  const waterOz = water.reduce((s, r) => s + (r.value ?? 0), 0) / days.length
  const drinkLogs = days.flatMap((d) => logsOn(d)).filter((l) => l.food_id && foodById[l.food_id]?.meta.externalId?.startsWith('drink:'))

  const counts: Partial<Record<DrinkKey, number>> = {}
  for (const r of water) {
    const key = r.meta.drink === 'sparkling_water' ? 'sparkling_water' : 'water'
    counts[key] = (counts[key] ?? 0) + 1
  }
  for (const l of drinkLogs) {
    const ext = foodById[l.food_id!].meta.externalId!.slice('drink:'.length)
    const key = (ext === 'espresso' ? (l.amount >= 2 ? 'espresso_double' : 'espresso_single') : ext) as DrinkKey
    counts[key] = (counts[key] ?? 0) + 1
  }
  const caffeine = drinkLogs.reduce((s, l) => s + (l.nutrients.caffeineMg ?? 0), 0)
  const label = (d: Drink) => (d.key.startsWith('espresso') ? `${d.serving.split(' ')[0]} espresso` : d.label)

  function add(d: Drink) {
    const now = new Date()
    if (d.hydration) {
      const id = crypto.randomUUID()
      saveReading({
        id,
        taken_at: now.toISOString(),
        kind: 'water',
        value: d.oz,
        urine_level: null,
        context: 'other',
        note: null,
        predicted_value: null,
        unit: 'oz',
        meta: d.key === 'water' ? { tz: deviceTz() } : { drink: d.key, tz: deviceTz() },
        updated_at: now.toISOString(),
        deleted_at: null,
      })
      setUndo({ kind: 'reading', ids: [id], label: label(d) })
      return
    }
    if (asksForMilk(d)) {
      setEspresso(d)
      return
    }
    const ids = [logDrinkFood(d, now).id]
    // Teas that always take milk log it in the same tap, as its own entry.
    const milk = d.milk && MILKS.find((m) => m.key === d.milk!.key)
    if (milk) ids.push(logFood(findOrSave(milkFood(milk)), d.milk!.oz, 'fl oz', mealForTime(now), now).id)
    setUndo({ kind: 'log', ids, label: label(d) })
  }

  /**
   * The saved food for a built-in drink, refreshed to the app's current values when they've changed
   * (e.g. a corrected caffeine number). Past logs keep the values they were logged with.
   */
  const findOrSave = (template: ReturnType<typeof drinkFood>): Food => {
    const found = foods.find((f) => f.meta.externalId === template.meta.externalId)
    if (!found) return saveFood(template)
    if (
      found.name === template.name &&
      JSON.stringify(found.per_100g) === JSON.stringify(template.per_100g) &&
      JSON.stringify(found.fields_estimated) === JSON.stringify(template.fields_estimated)
    )
      return found
    const refreshed: Food = { ...found, name: template.name, per_100g: template.per_100g, fields_estimated: template.fields_estimated, confidence: template.confidence }
    saveFood(refreshed)
    return refreshed
  }

  function logDrinkFood(d: Drink, at: Date) {
    const { amount, unit } = drinkPortion(d)
    return logFood(findOrSave(drinkFood(d)), amount, unit, mealForTime(at), at)
  }

  function logEspresso(d: Drink, milk: MilkKey | null, oz: number) {
    const now = new Date()
    const ids = [logDrinkFood(d, now).id]
    const m = MILKS.find((x) => x.key === milk)
    if (m && oz > 0) ids.push(logFood(findOrSave(milkFood(m)), oz, 'fl oz', mealForTime(now), now).id)
    setUndo({ kind: 'log', ids, label: m && oz > 0 ? `${label(d)} with milk` : label(d) })
    setEspresso(null)
  }

  const tally = ALL_DRINKS.filter((d) => !d.hydration && counts[d.key]).map((d) => `${counts[d.key]} ${label(d)}`)

  return (
    <section className="card">
      <h2>Drinks{days.length > 1 ? ' (7-day totals)' : ''}</h2>
      <Bar label={days.length > 1 ? 'Water, daily average' : 'Water'} value={waterOz / 8} target={Math.round((waterTargetOz / 8) * 10) / 10} unit="cups" color="var(--water)" />
      {(tally.length > 0 || counts.sparkling_water) && (
        <p className="muted small" style={{ margin: '0 0 8px' }}>
          {counts.sparkling_water ? `${counts.sparkling_water} cup${counts.sparkling_water > 1 ? 's' : ''} sparkling in the water total. ` : ''}
          {tally.length > 0 && `${isToday ? 'Also today' : 'Also'}: ${tally.join(' · ')}${caffeine > 0 ? ` · ${Math.round(caffeine)} mg caffeine` : ''}.`}
        </p>
      )}
      {!isToday && !tally.length && !water.length && <p className="muted small">No drinks logged.</p>}
      {isToday && <div className="drink-grid">
        {DRINKS.map((d) => (
          <button key={d.key} type="button" className="drink-btn" onClick={() => add(d)} aria-label={`Log ${label(d)}, ${d.serving}`}>
            <span className="drink-dot" style={{ background: d.color }} aria-hidden="true" />
            <span className="drink-name">{d.key.startsWith('espresso') ? 'Espresso' : d.label}</span>
            <span className="drink-serving">{d.serving}</span>
            {counts[d.key] ? <span className="drink-count">{counts[d.key]}</span> : null}
          </button>
        ))}
      </div>}
      {undo && isToday && (
        <button
          type="button"
          className="btn secondary small-btn"
          style={{ marginTop: 8 }}
          onClick={() => {
            for (const id of undo.ids) {
              if (undo.kind === 'reading') deleteReading(id)
              else deleteLog(id)
            }
            setUndo(null)
          }}
        >
          Undo {undo.label}
        </button>
      )}
      {espresso && (
        <EspressoSheet drink={espresso} foods={foods} onLog={logEspresso} onClose={() => setEspresso(null)} />
      )}
    </section>
  )
}

/** Asks which milk and how much, defaulting to the milk and amount used last time. */
function EspressoSheet({
  drink,
  foods,
  onLog,
  onClose,
}: {
  drink: Drink
  foods: Food[]
  onLog: (d: Drink, milk: MilkKey | null, oz: number) => void
  onClose: () => void
}) {
  const milkFoods = MILKS.map((m) => ({ m, food: foods.find((f) => f.meta.externalId === `drink:milk_${m.key}`) }))
  const last = milkFoods.filter((x) => x.food?.last_used_at).sort((a, b) => b.food!.last_used_at!.localeCompare(a.food!.last_used_at!))[0]
  // Espresso has a Single/Double switch; a pod (Kazaar) is always one.
  const isEspresso = drink.key.startsWith('espresso')
  const [shots, setShots] = useState<'espresso_single' | 'espresso_double'>(isEspresso ? (drink.key as 'espresso_single') : 'espresso_single')
  const [milk, setMilk] = useState<MilkKey | 'none'>(last?.m.key ?? 'fairlife_fat_free')
  const [ozText, setOzText] = useState(String(last?.food?.meta.lastAmount ?? 4))
  const oz = Number(ozText)
  const chosen = MILKS.find((m) => m.key === milk)
  const n = chosen && oz > 0 ? portionNutrients({ ...milkFood(chosen), id: '', favorite: false, use_count: 0, last_used_at: null, updated_at: '', deleted_at: null }, oz * 30.5) : null
  const d = isEspresso ? ALL_DRINKS.find((x) => x.key === shots)! : drink

  return (
    <Sheet title={isEspresso ? 'Espresso' : drink.label} subtitle="Which milk did you add?" onClose={onClose}>
      {isEspresso && (
        <Segmented
          label="Shots"
          value={shots}
          options={[
            { value: 'espresso_single', label: 'Single' },
            { value: 'espresso_double', label: 'Double' },
          ]}
          onChange={setShots}
        />
      )}
      <div className="field">
        <span className="label">Milk</span>
        <div className="chips">
          {[...MILKS.map((m) => ({ value: m.key as MilkKey | 'none', label: m.label })), { value: 'none' as const, label: 'No milk' }].map((o) => (
            <button key={o.value} type="button" className={`chip-btn ${milk === o.value ? 'on' : ''}`} aria-pressed={milk === o.value} onClick={() => setMilk(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {milk !== 'none' && (
        <div className="field">
          <label htmlFor="esp-oz">How much milk</label>
          <div className="row">
            <input id="esp-oz" type="number" inputMode="decimal" step={0.5} min={0} value={ozText} onChange={(e) => setOzText(e.target.value)} />
            <span className="muted small" style={{ flex: 'none' }}>
              oz
            </span>
          </div>
          <div className="chips" style={{ marginTop: 6 }}>
            {[2, 4, 6, 8].map((v) => (
              <button key={v} type="button" className={`chip-btn ${oz === v ? 'on' : ''}`} onClick={() => setOzText(String(v))}>
                {v} oz
              </button>
            ))}
          </div>
          {n && (
            <div className="hint">
              Milk adds {Math.round(n.kcal ?? 0)} kcal · {(n.protein ?? 0).toFixed(1)} g protein · {(n.netCarbs ?? 0).toFixed(1)} g net carbs
              {chosen?.sweeteners?.length ? ` · sweetened with ${chosen.sweeteners.join(' and ')}` : ''}
            </div>
          )}
        </div>
      )}
      <button type="button" className="btn" disabled={milk !== 'none' && !(oz > 0)} onClick={() => onLog(d, milk === 'none' ? null : milk, milk === 'none' ? 0 : oz)}>
        Log {isEspresso ? `${d.serving} espresso` : d.label}
        {milk !== 'none' && oz > 0 ? ` + ${oz} oz milk` : ''}
      </button>
    </Sheet>
  )
}
