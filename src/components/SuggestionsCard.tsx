import { useMemo } from 'react'
import type { MuscleGoal } from '../lib/aminoAcids'
import { useData } from '../lib/data'
import type { LogEntry } from '../lib/foods'
import { suggestFixes, usualFoods } from '../lib/suggest'
import type { Targets } from '../lib/targets'
import type { Sex } from '../lib/types'
import type { Nutrients } from '../lib/nutrients'
import type { WatchContext, WatchSettings } from '../lib/watchlist'

interface Props {
  dayLogs: LogEntry[]
  targets: Targets
  muscleGoal: MuscleGoal
  fatBudget: number | null
  past: boolean
  sex: Sex
  watch: { ctx: WatchContext; settings?: WatchSettings; weekItems: Nutrients[] }
}

const ICON = { add: '＋', trim: '−', swap: '⇄' } as const

/** Small fixes from the foods you usually eat: what to add, trim or swap to hit the day's targets. */
export function SuggestionsCard({ dayLogs, targets, muscleGoal, fatBudget, past, sex, watch }: Props) {
  const { foods, logs } = useData()
  const tips = useMemo(
    () => suggestFixes({ dayLogs, history: logs, foods, targets, muscleGoal, fatBudget, past, sex, watch }),
    [dayLogs, logs, foods, targets, muscleGoal, fatBudget, past, sex, watch],
  )
  const learned = useMemo(() => usualFoods(foods, logs).length, [foods, logs])
  if (!dayLogs.length) return null

  return (
    <section className="card">
      <h2>{past ? 'What would have done it' : 'To hit your targets'}</h2>
      {tips.length ? (
        <div className="tips">
          {tips.map((t) => (
            <div key={t.text} className={`tip ${t.kind}`}>
              <span className="tip-icon" aria-hidden="true">
                {ICON[t.kind]}
              </span>
              <span>
                <b>{t.text}</b>
                <span className="muted small">{t.effect}</span>
                {t.warning && <span className="tip-warn small">⚠ {t.warning}</span>}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {learned
            ? past
              ? 'Every target was met that day. Nothing to change.'
              : 'Everything is on track so far.'
            : 'Suggestions come from ingredients you log at least twice (eggs, salmon, nuts, spinach…). Keep logging and they’ll show up here.'}
        </p>
      )}
      {tips.length > 0 && (
        <p className="muted small" style={{ marginBottom: 0 }}>
          Picked from the {learned} ingredients you log most, in your usual portions. Recipes, restaurant dishes and drinks aren’t used.
        </p>
      )}
    </section>
  )
}
