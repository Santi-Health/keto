import { useState } from 'react'
import { useData } from '../lib/data'
import { ALL_DRINKS, CAFFEINE_FREE_MG, DRINKS, ML_PER_OZ, drinkByKey, glasses, liters, MILKS, asksForMilk, drinkFood, drinkPortion, hydration, milkFood, type Drink, type DrinkKey, type MilkKey } from '../lib/drinks'
import { buildLogEntry, portionNutrients, type Food, type LogEntry } from '../lib/foods'
import { mealForTime } from '../lib/foods'
import { portionText, unshout } from '../lib/quickFoods'
import { localDate } from '../lib/targets'
import { deviceTz } from '../lib/time'
import { DrinkIcon } from './DrinkIcon'
import { Segmented } from './Fields'
import { Sheet } from './Sheet'

interface Props {
  /** Days to show: one day, or a week (counts are totals, water is a daily average). */
  days: string[]
  waterTargetOz: number
}

type Undo = { kind: 'reading' | 'log'; ids: string[]; label: string; can?: { entry: LogEntry; food: Food } }

/** One tap per drink. Every drink fills the water goal by volume; sodas, coffee and tea also log caffeine, sodium and sweeteners. */
export function DrinksCard({ days, waterTargetOz }: Props) {
  const { readingsOn, saveReading, deleteReading, logsOn, deleteLog, updateLog, foods, foodById, saveFood, logFood } = useData()
  const [undo, setUndo] = useState<Undo | null>(null)
  const [espresso, setEspresso] = useState<Drink | null>(null)
  const isToday = days.length === 1 && days[0] === localDate()
  const water = days.flatMap((d) => readingsOn(d)).filter((r) => r.kind === 'water')
  const waterOz = water.reduce((s, r) => s + (r.value ?? 0), 0) / days.length
  const isDrinkLog = (l: { food_id: string | null }) => !!l.food_id && !!foodById[l.food_id]?.meta.externalId?.startsWith('drink:')
  const drinkLogs = days.flatMap((d) => logsOn(d)).filter(isDrinkLog)
  const isMilkLog = (l: { food_id: string | null }) => !!foodById[l.food_id!]?.meta.externalId?.startsWith('drink:milk_')
  // Fluid per day (caffeine is judged per day), averaged over the week.
  const perDay = days.map((d) =>
    hydration(
      readingsOn(d).filter((r) => r.kind === 'water').reduce((s, r) => s + (r.value ?? 0), 0),
      logsOn(d).filter(isDrinkLog).map((l) => ({ grams: l.grams, caffeineMg: l.nutrients.caffeineMg })),
    ),
  )
  const avg = (get: (h: (typeof perDay)[number]) => number) => perDay.reduce((s, h) => s + get(h), 0) / days.length
  const fluid = { total: avg((h) => h.totalOz), drinks: avg((h) => h.drinksOz), loss: avg((h) => h.caffeineLossOz) }

  const counts: Partial<Record<DrinkKey, number>> = {}
  for (const r of water) {
    const key = (drinkByKey(String(r.meta.drink ?? ''))?.key ?? 'water') as DrinkKey
    counts[key] = (counts[key] ?? 0) + 1
  }
  for (const l of drinkLogs) {
    const ext = foodById[l.food_id!].meta.externalId!.slice('drink:'.length)
    const key = (ext === 'espresso' ? (l.amount >= 2 ? 'espresso_double' : 'espresso_single') : ext) as DrinkKey
    // Cans and bottles count by amount, so half a can shows as ½.
    counts[key] = (counts[key] ?? 0) + (l.unit === 'can' || l.unit === 'bottle' ? l.amount : 1)
  }
  const caffeine = drinkLogs.reduce((s, l) => s + (l.nutrients.caffeineMg ?? 0), 0)
  const label = (d: Drink) => (d.key.startsWith('espresso') ? `${d.serving.split(' ')[0]} espresso` : d.label)

  // Milk goes with the coffee or tea logged in the same tap; anything else stands alone.
  const groups = new Map<string, typeof drinkLogs>()
  for (const l of drinkLogs) {
    const key = isMilkLog(l) ? (drinkLogs.find((o) => o.eaten_at === l.eaten_at && !isMilkLog(o))?.id ?? l.id) : l.id
    groups.set(key, [...(groups.get(key) ?? []), l])
  }
  const drinkGroups = [...groups.values()]
  // Every drink logged that day, newest first, so a mistake can be removed later (not only right after the tap).
  const [removing, setRemoving] = useState(false)
  const entries = [
    ...water.map((r) => ({
      id: r.id,
      at: r.taken_at,
      name: `${drinkByKey(String(r.meta.drink ?? ''))?.label ?? 'Water'} · ${liters(r.value ?? 0)}`,
      remove: () => deleteReading(r.id),
    })),
    // Coffee or tea and the milk poured in it are one drink: logged in the same tap, removed together.
    ...drinkGroups.map((group) => {
      const parts = [...group].sort((a, b) => Number(isMilkLog(a)) - Number(isMilkLog(b)))
      return {
        id: parts[0].id,
        at: parts[0].eaten_at,
        name: parts.map((l) => (isMilkLog(l) ? `${portionText(l.amount, l.unit)} ${unshout(foodById[l.food_id!]?.name ?? l.food_name)}` : `${unshout(foodById[l.food_id!]?.name ?? l.food_name)} · ${portionText(l.amount, l.unit)}`)).join(' + '),
        remove: () => parts.forEach((l) => deleteLog(l.id)),
      }
    }),
  ].sort((a, b) => b.at.localeCompare(a.at))

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
    const { entry, food } = logDrinkFood(d, now)
    const ids = [entry.id]
    if (entry.unit === 'can' || entry.unit === 'bottle') {
      setUndo({ kind: 'log', ids, label: label(d), can: { entry, food } })
      return
    }
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
    const food = findOrSave(drinkFood(d))
    return { entry: logFood(food, amount, unit, mealForTime(at), at), food }
  }

  /** You only had half the can or bottle: same entry, half the amount (and half the caffeine, sodium and fluid). */
  function halfCan(u: NonNullable<Undo['can']>) {
    const half = buildLogEntry(u.food, 0.5, u.entry.unit, u.entry.meal, new Date(u.entry.eaten_at))
    updateLog({ ...u.entry, ...half, id: u.entry.id })
    setUndo((x) => (x ? { ...x, label: `½ ${x.label}`, can: undefined } : x))
  }

  function logEspresso(d: Drink, milk: MilkKey | null, oz: number) {
    const now = new Date()
    const ids = [logDrinkFood(d, now).entry.id]
    const m = MILKS.find((x) => x.key === milk)
    if (m && oz > 0) ids.push(logFood(findOrSave(milkFood(m)), oz, 'fl oz', mealForTime(now), now).id)
    setUndo({ kind: 'log', ids, label: m && oz > 0 ? `${label(d)} with milk` : label(d) })
    setEspresso(null)
  }

  const sparkling = [
    counts.sparkling_water && `${counts.sparkling_water} glass${counts.sparkling_water > 1 ? 'es' : ''} sparkling`,
    counts.sparkling_rain && `${counts.sparkling_rain} can${counts.sparkling_rain > 1 ? 's' : ''} Sparkling Rain`,
  ]
    .filter(Boolean)
    .join(' and ')
  const tally = ALL_DRINKS.filter((d) => !d.hydration && counts[d.key]).map((d) => `${counts[d.key]} ${label(d)}`)

  return (
    <section className="card">
      <h2>Drinks{days.length > 1 ? ' (7-day totals)' : ''}</h2>
      <div className="bar-head">
        <span className="bar-label">{days.length > 1 ? 'Fluids, daily average' : 'Fluids'}</span>
        <span className="muted">
          {liters(fluid.total)} / {liters(waterTargetOz)}
        </span>
      </div>
      <Glasses fills={glasses(fluid.total, waterTargetOz)} />
      {fluid.drinks > 0 && (
        <p className="muted small" style={{ margin: '0 0 4px' }}>
          {liters(waterOz)} water + {liters(fluid.drinks)} from other drinks
          {fluid.loss > 0.05
            ? ` − ${liters(fluid.loss)} for caffeine over ${CAFFEINE_FREE_MG} mg.`
            : '. Coffee, tea and sodas hydrate like water at your caffeine level.'}
        </p>
      )}
      {(tally.length > 0 || sparkling) && (
        <p className="muted small" style={{ margin: '0 0 8px' }}>
          {sparkling ? `${sparkling} in the water total. ` : ''}
          {tally.length > 0 && `${isToday ? 'Also today' : 'Also'}: ${tally.join(' · ')}${caffeine > 0 ? ` · ${Math.round(caffeine)} mg caffeine` : ''}.`}
        </p>
      )}
      {!isToday && !tally.length && !water.length && <p className="muted small">No drinks logged.</p>}
      {isToday && <div className="drink-grid">
        {DRINKS.map((d) => (
          <button key={d.key} type="button" className="drink-btn" onClick={() => add(d)} aria-label={`Log ${label(d)}, ${d.serving}`}>
            <DrinkIcon drink={d.key} color={d.color} />
            <span className="drink-name">{d.key.startsWith('espresso') ? 'Espresso' : d.label}</span>
            <span className="drink-serving">{d.serving}</span>
            {counts[d.key] ? <span className="drink-count">{counts[d.key]}</span> : null}
          </button>
        ))}
      </div>}
      {undo && isToday && (
        <div className="row-btns" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {undo.can && (
          <button type="button" className="btn secondary small-btn" onClick={() => halfCan(undo.can!)}>
            Make it ½ {undo.can.entry.unit}
          </button>
        )}
        <button
          type="button"
          className="btn secondary small-btn"
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
        </div>
      )}
      {days.length === 1 && entries.length > 0 && (
        <>
          <button type="button" className="more-link" aria-expanded={removing} onClick={() => setRemoving(!removing)}>
            {removing ? 'Done removing' : 'Remove a drink ›'}
          </button>
          {removing && (
            <ul className="drink-entries">
              {entries.map((e) => (
                <li key={e.id}>
                  <span className="muted small">{new Date(e.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                  <span className="drink-entry-name">{e.name}</span>
                  <button type="button" className="icon-btn" aria-label={`Remove ${e.name}`} onClick={e.remove}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {espresso && (
        <EspressoSheet drink={espresso} foods={foods} onLog={logEspresso} onClose={() => setEspresso(null)} />
      )}
    </section>
  )
}

/** A row of glasses, 250 ml each, filled as the day's fluids add up. */
function Glasses({ fills }: { fills: (0 | 0.5 | 1)[] }) {
  const full = fills.reduce<number>((a, b) => a + b, 0)
  return (
    <div className="glasses" role="img" aria-label={`${full} of ${fills.length} glasses`}>
      {fills.map((f, i) => (
        <svg key={i} viewBox="0 0 24 32" className="glass">
          {/* Water, then the glass outline on top. The glass narrows toward the bottom. */}
          {f > 0 && <path d={f === 1 ? 'M4.6 6 L19.4 6 L17.6 29 L6.4 29 Z' : 'M5.8 17.5 L18.2 17.5 L17.6 29 L6.4 29 Z'} className="glass-water" />}
          <path d="M3 2 L21 2 L18 30 L6 30 Z" className="glass-rim" />
        </svg>
      ))}
    </div>
  )
}

/** The 340 ml fairlife chocolate bottle, poured whole into a coffee. */
const FAIRLIFE_BOTTLE_OZ = Math.round((340 / ML_PER_OZ) * 10) / 10

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
  // Espresso has a Single/Double switch; a pod (Kazaar, Decaf Ristretto, BA Lungo) is always one.
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
            {milk === 'fairlife_chocolate' && (
              <button type="button" className={`chip-btn ${oz === FAIRLIFE_BOTTLE_OZ ? 'on' : ''}`} onClick={() => setOzText(String(FAIRLIFE_BOTTLE_OZ))}>
                {FAIRLIFE_BOTTLE_OZ} oz
              </button>
            )}
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
