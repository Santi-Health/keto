import { useRef, useState, type ReactNode } from 'react'
import { useData } from '../lib/data'
import { ALL_DRINKS, CAFFEINE_FREE_MG, DRINKS, ML_PER_OZ, SPIRIT_OZ, drinkByKey, glasses, liters, MILKS, asksForMilk, isCan, drinkFood, drinkPortion, hydration, milkFood, type Drink, type DrinkKey, type MilkKey, type MixerKey } from '../lib/drinks'
import { buildLogEntry, portionNutrients, type Food, type LogEntry } from '../lib/foods'
import { mealForTime } from '../lib/foods'
import { portionText, unshout } from '../lib/quickFoods'
import { localDate } from '../lib/targets'
import { deviceTz } from '../lib/time'
import { DrinkIcon } from './DrinkIcon'
import { Segmented } from './Fields'
import { toLocalInput } from './LogFoodSheet'
import { Sheet } from './Sheet'

/** Drinks that can be made half: what was left in the can, bottle or glass. */
const HALVES = ['can', 'bottle', 'glass']

interface Props {
  /** Days to show: one day, or a week (counts are totals, water is a daily average). */
  days: string[]
  waterTargetOz: number
}

/** `readings` are water logged in the same tap as food logs (whisky and sparkling water). */
type Undo = { kind: 'reading' | 'log'; ids: string[]; label: string; can?: { entry: LogEntry; food: Food }; readings?: string[] }

/** The same moment at another clock time that day. Seconds stay, so two drinks moved to one minute stay apart. */
function atClock(iso: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(iso)
  d.setHours(h, m)
  return d
}

/** Clock time of a logged drink; a phone's picker saves when it closes. */
function DrinkTime({ at, label, onChange }: { at: string; label: string; onChange: (hhmm: string) => void }) {
  return <input className="drink-time" type="time" aria-label={label} value={toLocalInput(new Date(at)).slice(11)} onChange={(e) => e.target.value && onChange(e.target.value)} />
}

/** One tap per drink. Every drink fills the water goal by volume; sodas, coffee and tea also log caffeine, sodium and sweeteners. */
export function DrinksCard({ days, waterTargetOz }: Props) {
  const { readingsOn, saveReading, deleteReading, logsOn, deleteLog, updateLog, foods, foodById, saveFood, logFood } = useData()
  const [undo, setUndo] = useState<Undo | null>(null)
  const [espresso, setEspresso] = useState<Drink | null>(null)
  const [byOz, setByOz] = useState<Drink | null>(null)
  const [spirit, setSpirit] = useState<Drink | null>(null)
  const isToday = days.length === 1 && days[0] === localDate()
  const water = days.flatMap((d) => readingsOn(d)).filter((r) => r.kind === 'water')
  const waterOz = water.reduce((s, r) => s + (r.value ?? 0), 0) / days.length
  const isDrinkLog = (l: { food_id: string | null }) => !!l.food_id && !!foodById[l.food_id]?.meta.externalId?.startsWith('drink:')
  const drinkLogs = days.flatMap((d) => logsOn(d)).filter(isDrinkLog)
  const isMilkLog = (l: { food_id: string | null }) => !!foodById[l.food_id!]?.meta.externalId?.startsWith('drink:milk_')
  const drinkOf = (l: { food_id: string | null }) => drinkByKey(foodById[l.food_id!]?.meta.externalId?.slice('drink:'.length) ?? '')
  const isSpiritLog = (l: { food_id: string | null }) => !!drinkOf(l)?.spirit
  const allDrinkLogs = days.flatMap((d) => logsOn(d)).filter(isDrinkLog)
  /** Milk in a coffee, or Coke Zero poured into a rum: logged in the same tap, part of that drink. */
  const isAddOn = (l: { id: string; food_id: string | null; eaten_at: string }) =>
    isMilkLog(l) || (!isSpiritLog(l) && allDrinkLogs.some((o) => o.id !== l.id && o.eaten_at === l.eaten_at && isSpiritLog(o)))
  // Fluid per day (caffeine is judged per day), averaged over the week.
  const perDay = days.map((d) =>
    hydration(
      readingsOn(d).filter((r) => r.kind === 'water').reduce((s, r) => s + (r.value ?? 0), 0),
      // Spirits, beer and wine don't count as fluid.
      logsOn(d).filter(isDrinkLog).map((l) => ({ grams: drinkOf(l)?.spirit || drinkOf(l)?.alcohol ? 0 : l.grams, caffeineMg: l.nutrients.caffeineMg })),
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
    if (isAddOn(l)) continue
    const ext = foodById[l.food_id!].meta.externalId!.slice('drink:'.length)
    const key = (ext === 'espresso' ? (l.amount >= 2 ? 'espresso_double' : 'espresso_single') : ext) as DrinkKey
    // Cans, bottles and glasses count by amount, so half a can shows as ½.
    counts[key] = (counts[key] ?? 0) + (HALVES.includes(l.unit) ? l.amount : 1)
  }
  const caffeine = drinkLogs.reduce((s, l) => s + (l.nutrients.caffeineMg ?? 0), 0)
  const label = (d: Drink) => (d.key.startsWith('espresso') ? `${d.serving.split(' ')[0]} espresso` : d.label)

  // Milk goes with the coffee or tea logged in the same tap; anything else stands alone.
  const groups = new Map<string, typeof drinkLogs>()
  for (const l of drinkLogs) {
    const key = isAddOn(l) ? (drinkLogs.find((o) => o.eaten_at === l.eaten_at && !isAddOn(o))?.id ?? l.id) : l.id
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
      retime: (hhmm: string) => saveReading({ ...r, taken_at: atClock(r.taken_at, hhmm).toISOString() }),
    })),
    // Coffee or tea and the milk poured in it are one drink: logged in the same tap, removed together.
    ...drinkGroups.map((group) => {
      const parts = [...group].sort((a, b) => Number(isAddOn(a)) - Number(isAddOn(b)))
      return {
        id: parts[0].id,
        at: parts[0].eaten_at,
        name: parts.map((l) => (isAddOn(l) ? `${portionText(l.amount, l.unit)} ${unshout(foodById[l.food_id!]?.name ?? l.food_name)}` : `${unshout(foodById[l.food_id!]?.name ?? l.food_name)} · ${portionText(l.amount, l.unit)}`)).join(' + '),
        remove: () => parts.forEach((l) => deleteLog(l.id)),
        // The milk moves with its drink, so they stay one entry.
        retime: (hhmm: string) => {
          const at = atClock(parts[0].eaten_at, hhmm)
          for (const l of parts) updateLog({ ...l, eaten_at: at.toISOString(), meal: mealForTime(at) })
        },
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
    if (d.spirit) {
      setSpirit(d)
      return
    }
    const { entry, food } = logDrinkFood(d, now)
    const ids = [entry.id]
    if (HALVES.includes(entry.unit)) {
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
      JSON.stringify(found.fields_estimated) === JSON.stringify(template.fields_estimated) &&
      JSON.stringify(found.unit_conversions) === JSON.stringify(template.unit_conversions)
    )
      return found
    const refreshed: Food = { ...found, name: template.name, per_100g: template.per_100g, unit_conversions: template.unit_conversions, fields_estimated: template.fields_estimated, confidence: template.confidence }
    saveFood(refreshed)
    return refreshed
  }

  function logDrinkFood(d: Drink, at: Date) {
    const { amount, unit } = drinkPortion(d)
    const food = findOrSave(drinkFood(d))
    return { entry: logFood(food, amount, unit, mealForTime(at), at), food }
  }

  /** A can by the ounce (held button): a full can logs as a can (so it can be halved), anything else in ounces. */
  function logByOz(d: Drink, oz: number) {
    const now = new Date()
    if (d.hydration) {
      const id = crypto.randomUUID()
      saveReading({ id, taken_at: now.toISOString(), kind: 'water', value: oz, urine_level: null, context: 'other', note: null, predicted_value: null, unit: 'oz', meta: { drink: d.key, tz: deviceTz() }, updated_at: now.toISOString(), deleted_at: null })
      setUndo({ kind: 'reading', ids: [id], label: oz === 12 ? label(d) : `${oz} oz ${label(d)}` })
      setByOz(null)
      return
    }
    const food = findOrSave(drinkFood(d))
    const entry = oz === 12 ? logFood(food, 1, 'can', mealForTime(now), now) : logFood(food, oz, 'fl oz', mealForTime(now), now)
    setUndo({ kind: 'log', ids: [entry.id], label: oz === 12 ? label(d) : `${oz} oz ${label(d)}`, can: oz === 12 ? { entry, food } : undefined })
    setByOz(null)
  }

  /** A spirit and what it was mixed with, at the same moment so they read as one drink. */
  function logSpirit(d: Drink, oz: number, mixer: MixerKey | null, mixerOz: number) {
    const now = new Date()
    const ids = [logFood(findOrSave(drinkFood(d)), oz, 'fl oz', mealForTime(now), now).id]
    const readings: string[] = []
    if (mixer === 'coke_zero' && mixerOz > 0) ids.push(logFood(findOrSave(drinkFood(drinkByKey('coke_zero')!)), mixerOz, 'fl oz', mealForTime(now), now).id)
    if (mixer === 'sparkling_water' && mixerOz > 0) {
      const id = crypto.randomUUID()
      saveReading({ id, taken_at: now.toISOString(), kind: 'water', value: mixerOz, urine_level: null, context: 'other', note: null, predicted_value: null, unit: 'oz', meta: { drink: 'sparkling_water', tz: deviceTz() }, updated_at: now.toISOString(), deleted_at: null })
      readings.push(id)
    }
    const mixed = mixer && mixerOz > 0 ? ` and ${mixer === 'coke_zero' ? 'Coke Zero' : 'sparkling water'}` : ''
    setUndo({ kind: 'log', ids, readings, label: `${oz} oz ${label(d)}${mixed}` })
    setSpirit(null)
  }

  /** You only had half the can or bottle: same entry, half the amount (and half the caffeine, sodium and fluid). */
  function halfCan(u: NonNullable<Undo['can']>) {
    // As it is now: its time may have changed since the tap.
    const entry = drinkLogs.find((l) => l.id === u.entry.id) ?? u.entry
    const half = buildLogEntry(u.food, 0.5, entry.unit, entry.meal, new Date(entry.eaten_at))
    updateLog({ ...entry, ...half, id: entry.id })
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
  const justLogged = undo && entries.find((e) => e.id === undo.ids[0])

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
          <DrinkButton key={d.key} label={`Log ${label(d)}, ${d.serving}`} onTap={() => add(d)} onHold={isCan(d) ? () => setByOz(d) : undefined}>
            <DrinkIcon drink={d.key} color={d.color} />
            <span className="drink-name">{d.key.startsWith('espresso') ? 'Espresso' : d.label}</span>
            <span className="drink-serving">{d.serving}</span>
            {counts[d.key] ? <span className="drink-count">{counts[d.key]}</span> : null}
          </DrinkButton>
        ))}
      </div>}
      {isToday && <p className="muted small" style={{ margin: '6px 0 0' }}>Tap a can to log it. Hold it to pick the ounces.</p>}
      {undo && isToday && (
        <div className="row-btns" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {justLogged && (
          <label className="muted small drink-when">
            {undo.label} at <DrinkTime at={justLogged.at} label={`Time of ${undo.label}`} onChange={justLogged.retime} />
          </label>
        )}
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
            for (const id of undo.readings ?? []) deleteReading(id)
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
            {removing ? 'Done' : 'Change time or remove a drink ›'}
          </button>
          {removing && (
            <ul className="drink-entries">
              {entries.map((e) => (
                <li key={e.id}>
                  <DrinkTime at={e.at} label={`Time of ${e.name}`} onChange={e.retime} />
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
      {byOz && <OuncesSheet drink={byOz} onLog={logByOz} onClose={() => setByOz(null)} />}
      {spirit && <SpiritSheet drink={spirit} onLog={logSpirit} onClose={() => setSpirit(null)} />}
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
  const choices = drink.milkChoices
  const offered = choices ? choices.map((c) => MILKS.find((m) => m.key === c.key)!) : MILKS
  const milkFoods = offered.map((m) => ({ m, food: foods.find((f) => f.meta.externalId === `drink:milk_${m.key}`) }))
  const last = milkFoods.filter((x) => x.food?.last_used_at).sort((a, b) => b.food!.last_used_at!.localeCompare(a.food!.last_used_at!))[0]
  // Espresso has a Single/Double switch; a pod (Kazaar, Decaf Ristretto, BA Lungo) is always one.
  const isEspresso = drink.key.startsWith('espresso')
  const [shots, setShots] = useState<'espresso_single' | 'espresso_double'>(isEspresso ? (drink.key as 'espresso_single') : 'espresso_single')
  const [milk, setMilk] = useState<MilkKey | 'none'>(last?.m.key ?? (choices ? 'none' : 'fairlife_fat_free'))
  const usualOz = (key: MilkKey | 'none') => choices?.find((c) => c.key === key)?.oz
  const [ozText, setOzText] = useState(String(usualOz(milk) ?? last?.food?.meta.lastAmount ?? 4))
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
          {[...offered.map((m) => ({ value: m.key as MilkKey | 'none', label: usualOz(m.key) ? `${m.label} · ${usualOz(m.key)} oz` : m.label })), { value: 'none' as const, label: 'No milk' }].map((o) => (
            <button
              key={o.value}
              type="button"
              className={`chip-btn ${milk === o.value ? 'on' : ''}`}
              aria-pressed={milk === o.value}
              onClick={() => {
                setMilk(o.value)
                const oz = usualOz(o.value)
                if (oz) setOzText(String(oz))
              }}
            >
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
            {(choices ? [1, 2, 3, 4] : [2, 4, 6, 8]).map((v) => (
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
        {milk !== 'none' && oz > 0 ? ` + ${oz} oz ${milk === 'half_and_half' ? 'half and half' : 'milk'}` : ''}
      </button>
    </Sheet>
  )
}

/** An amount in ounces: typed, or one of the usual ones. */
function OzField({ id, label, value, onChange, chips }: { id: string; label: string; value: string; onChange: (v: string) => void; chips: number[] }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="row">
        <input id={id} type="number" inputMode="decimal" step={0.5} min={0} value={value} onChange={(e) => onChange(e.target.value)} onFocus={(e) => e.target.select()} />
        <span className="muted small" style={{ flex: 'none' }}>
          oz
        </span>
      </div>
      <div className="chips" style={{ marginTop: 6 }}>
        {chips.map((v) => (
          <button key={v} type="button" className={`chip-btn ${Number(value) === v ? 'on' : ''}`} onClick={() => onChange(String(v))}>
            {v} oz
          </button>
        ))}
      </div>
    </div>
  )
}

const HOLD_MS = 450

/** A drink button: a tap logs the usual amount; holding it (cans) opens the ounces instead. */
function DrinkButton({ label, onTap, onHold, children }: { label: string; onTap: () => void; onHold?: () => void; children: ReactNode }) {
  const timer = useRef<number | undefined>(undefined)
  const held = useRef(false)
  const from = useRef<{ x: number; y: number } | null>(null)
  const [holding, setHolding] = useState(false)
  const cancel = () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    from.current = null
    setHolding(false)
  }
  const hold = () => {
    if (held.current || !onHold) return
    held.current = true
    cancel()
    navigator.vibrate?.(15)
    onHold()
  }
  return (
    <button
      type="button"
      className={`drink-btn${holding ? ' holding' : ''}`}
      aria-label={onHold ? `${label}. Hold to pick the ounces.` : label}
      onPointerDown={
        onHold &&
        ((e) => {
          held.current = false
          from.current = { x: e.clientX, y: e.clientY }
          setHolding(true)
          timer.current = window.setTimeout(hold, HOLD_MS)
        })
      }
      onPointerMove={(e) => {
        // A scroll, not a hold.
        if (from.current && Math.hypot(e.clientX - from.current.x, e.clientY - from.current.y) > 10) cancel()
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={
        onHold &&
        ((e) => {
          // The phone's own long press: no menu, and it counts as the hold.
          e.preventDefault()
          if (timer.current !== undefined) hold()
        })
      }
      onClick={() => {
        if (held.current) {
          held.current = false
          return
        }
        onTap()
      }}
    >
      {children}
    </button>
  )
}

/** How many ounces of a can, 12 by default. */
function OuncesSheet({ drink, onLog, onClose }: { drink: Drink; onLog: (d: Drink, oz: number) => void; onClose: () => void }) {
  const [ozText, setOzText] = useState('12')
  const oz = Number(ozText)
  return (
    <Sheet title={drink.label} subtitle="How much did you have?" onClose={onClose}>
      <OzField id="soda-oz" label="Ounces (a can is 12)" value={ozText} onChange={setOzText} chips={[4, 6, 8, 12, 16, 20]} />
      <button type="button" className="btn" disabled={!(oz > 0)} onClick={() => onLog(drink, oz)}>
        Log {oz > 0 ? `${oz} oz ` : ''}
        {drink.label}
      </button>
    </Sheet>
  )
}

const MIXER_NAMES: Record<MixerKey, string> = { coke_zero: 'Coke Zero', sparkling_water: 'Sparkling water' }
const mixerMemory = (d: Drink) => `keto.mixer.${d.key}`

/** A spirit: how much (2 oz to start), and what it went with, remembered for next time. */
function SpiritSheet({ drink, onLog, onClose }: { drink: Drink; onLog: (d: Drink, oz: number, mixer: MixerKey | null, mixerOz: number) => void; onClose: () => void }) {
  const mixers = drink.spirit!.mixers
  const remembered = (() => {
    try {
      return JSON.parse(localStorage.getItem(mixerMemory(drink)) ?? 'null') as { mixer: MixerKey | 'none'; oz: number } | null
    } catch {
      return null
    }
  })()
  const [ozText, setOzText] = useState(String(SPIRIT_OZ))
  const [mixer, setMixer] = useState<MixerKey | 'none'>(remembered && (remembered.mixer === 'none' || mixers.includes(remembered.mixer)) ? remembered.mixer : mixers[0])
  const [mixerText, setMixerText] = useState(String(remembered?.oz ?? 6))
  const oz = Number(ozText)
  const mixerOz = Number(mixerText)
  const log = () => {
    try {
      localStorage.setItem(mixerMemory(drink), JSON.stringify({ mixer, oz: mixerOz }))
    } catch {
      // Only a convenience.
    }
    onLog(drink, oz, mixer === 'none' ? null : mixer, mixer === 'none' ? 0 : mixerOz)
  }
  return (
    <Sheet title={drink.label} subtitle={`${Math.round(oz * 64) || 0} kcal, no carbs`} onClose={onClose}>
      <OzField id="spirit-oz" label={`How much ${drink.label.toLowerCase()}`} value={ozText} onChange={setOzText} chips={[1, 1.5, 2, 3]} />
      <div className="field">
        <span className="label">With</span>
        <div className="chips">
          {[...mixers.map((m) => ({ value: m as MixerKey | 'none', label: MIXER_NAMES[m] })), { value: 'none' as const, label: 'Nothing' }].map((o) => (
            <button key={o.value} type="button" className={`chip-btn ${mixer === o.value ? 'on' : ''}`} aria-pressed={mixer === o.value} onClick={() => setMixer(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {mixer !== 'none' && <OzField id="mixer-oz" label={`How much ${MIXER_NAMES[mixer]}`} value={mixerText} onChange={setMixerText} chips={[4, 6, 8, 12]} />}
      <button type="button" className="btn" disabled={!(oz > 0) || (mixer !== 'none' && !(mixerOz > 0))} onClick={log}>
        Log {oz} oz {drink.label}
        {mixer !== 'none' && mixerOz > 0 ? ` + ${mixerOz} oz ${MIXER_NAMES[mixer]}` : ''}
      </button>
    </Sheet>
  )
}
