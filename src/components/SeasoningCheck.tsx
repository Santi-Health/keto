import { useMemo, useState } from 'react'
import { useData } from '../lib/data'
import type { LogEntry } from '../lib/foods'
import { asPinch, oversizedSeasonings, unshout } from '../lib/quickFoods'
import { entryDay } from '../lib/time'

/** The most to list; "Fix all" still covers the rest. */
const MAX_SHOWN = 5

const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** Lists salt and pepper logged at a mistaken amount, with a tap to fix. Hidden when there are none. */
export function SeasoningCheck({ onOpenDay }: { onOpenDay: (day: string) => void }) {
  const { logs, foodById, updateLog } = useData()
  const [all, setAll] = useState(false)
  const found = useMemo(() => oversizedSeasonings(logs, foodById).sort((a, b) => b.eaten_at.localeCompare(a.eaten_at)), [logs, foodById])
  if (!found.length) return null
  const shown = all ? found : found.slice(0, MAX_SHOWN)
  const kcal = found.reduce((s, l) => s + (l.nutrients.kcal ?? 0), 0)
  const carbs = found.reduce((s, l) => s + (l.nutrients.netCarbs ?? 0), 0)
  const fix = (l: LogEntry) => updateLog(asPinch(l))
  return (
    <section className="card" style={{ marginBottom: 12 }}>
      <h2>Check these entries</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        {found.length === 1 ? 'This looks' : `These ${found.length} look`} like a mistake, adding about {Math.round(kcal).toLocaleString()} kcal and {Math.round(carbs)} g net carbs in all.
      </p>
      {shown.map((l) => {
        const day = entryDay(l.eaten_at, l.meta?.tz)
        return (
          <div key={l.id} className="watch-food" style={{ alignItems: 'center', padding: '6px 0' }}>
            <button type="button" className="link" style={{ margin: 0, textAlign: 'left' }} onClick={() => onOpenDay(day)}>
              {dayLabel(day)} · {unshout(l.food_name)} · {Math.round(l.grams)} g
            </button>
            <button type="button" className="btn secondary" style={{ flex: '0 0 auto' }} onClick={() => fix(l)}>
              Set to 1 g
            </button>
          </div>
        )
      })}
      {found.length > MAX_SHOWN && !all && (
        <button type="button" className="link" style={{ margin: '6px 0 0' }} onClick={() => setAll(true)}>
          Show all {found.length}
        </button>
      )}
      {found.length > 1 && (
        <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => found.forEach(fix)}>
          Set all {found.length} to 1 g
        </button>
      )}
    </section>
  )
}
