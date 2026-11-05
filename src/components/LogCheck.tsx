import { useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { entriesToCheck, type FlaggedEntry } from '../lib/logCheck'
import { asPinch, resized, unshout } from '../lib/quickFoods'
import { localDate } from '../lib/targets'
import { entryDay } from '../lib/time'

/** The most to list at once. */
const MAX_SHOWN = 5

const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function why({ entry, reason, usualGrams }: FlaggedEntry): string {
  const kcal = Math.round(entry.nutrients.kcal ?? 0).toLocaleString()
  if (reason === 'seasoning') return `${Math.round(entry.grams)} g is more than a pinch`
  if (reason === 'usual') return `${Math.round(entry.grams)} g, and you usually have ${Math.round(usualGrams!)} g · ${kcal} kcal`
  return `${kcal} kcal in one entry`
}

/** Lists entries that look like a typo, with a tap to fix or keep each. Hidden when there are none. */
export function LogCheck({ onOpenDay }: { onOpenDay: (day: string) => void }) {
  const { logs, foodById, updateLog } = useData()
  const [all, setAll] = useState(false)
  const found = useMemo(() => entriesToCheck(logs, foodById, localDate()), [logs, foodById])
  if (!found.length) return null
  const shown = all ? found : found.slice(0, MAX_SHOWN)
  const seasonings = found.filter((f) => f.reason === 'seasoning')
  return (
    <section className="card" style={{ marginBottom: 12 }}>
      <h2>Check these entries</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        {found.length === 1 ? 'This looks' : `These ${found.length} look`} unusual. Tap one to open that day and edit it.
      </p>
      {shown.map((f) => {
        const { entry, reason, usualGrams } = f
        const day = entryDay(entry.eaten_at, entry.meta?.tz)
        return (
          <div key={entry.id} className="log-check">
            <button type="button" className="link" style={{ margin: 0, textAlign: 'left' }} onClick={() => onOpenDay(day)}>
              {dayLabel(day)} · {unshout(entry.food_name)}
            </button>
            <div className="muted small">{why(f)}</div>
            <div className="row" style={{ marginTop: 6 }}>
              {reason === 'seasoning' && (
                <button type="button" className="btn secondary" onClick={() => updateLog(asPinch(entry))}>
                  Set to 1 g
                </button>
              )}
              {reason === 'usual' && (
                <button type="button" className="btn secondary" onClick={() => updateLog(resized(entry, usualGrams!))}>
                  Set to {Math.round(usualGrams!)} g
                </button>
              )}
              <button type="button" className="btn secondary" onClick={() => updateLog({ ...entry, meta: { ...entry.meta, looksRight: true } })}>
                Looks right
              </button>
            </div>
          </div>
        )
      })}
      {found.length > MAX_SHOWN && !all && (
        <button type="button" className="link" style={{ margin: '6px 0 0' }} onClick={() => setAll(true)}>
          Show all {found.length}
        </button>
      )}
      {seasonings.length > 1 && (
        <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => seasonings.forEach((f) => updateLog(asPinch(f.entry)))}>
          Set all {seasonings.length} salt and pepper to 1 g
        </button>
      )}
    </section>
  )
}
