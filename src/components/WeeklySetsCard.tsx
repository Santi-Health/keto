import { useMemo } from 'react'
import { useData } from '../lib/data'
import { libraryFor, useCustomLifts } from '../lib/library'
import { localDate } from '../lib/targets'
import { shiftDay } from '../lib/goalPlan'

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
import { weekCoverage, type GroupWeek } from '../lib/training'

/** Bars of hard sets per muscle group against the weekly sets that keep (and build) muscle. */
export function WeeklySetsBars({ coverage }: { coverage: GroupWeek[] }) {
  return (
    <div className="coach-sets">
      {coverage.map((g) => (
        <div key={g.group}>
          <span>{g.group}</span>
          <span className="coach-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (g.sets / g.target) * 100)}%`, background: g.sets >= g.target ? 'var(--accent)' : 'var(--protein)' }} />
          </span>
          <span className="muted small">
            {g.sets}/{g.target}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Today's card: sets per muscle group over the 7 days ending on `day`, with a link to what to train. */
export function WeeklySetsCard({ day, onOpenCoach }: { day: string; onOpenCoach: () => void }) {
  const { exercises } = useData()
  const { custom } = useCustomLifts()
  const coverage = useMemo(() => weekCoverage(exercises, libraryFor(undefined, custom), day), [exercises, custom, day])
  const short = coverage.filter((g) => g.sets < g.target).length
  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 8 }}>
        <h2>Sets this week</h2>
        <span className={`badge ${short ? '' : 'ok'}`}>{short ? `${short} group${short === 1 ? '' : 's'} short` : 'All covered'}</span>
      </div>
      <WeeklySetsBars coverage={coverage} />
      <p className="muted small" style={{ marginBottom: 0 }}>
        Hard sets from {fmt(shiftDay(day, -6))} to {day === localDate() ? `today (${fmt(day)})` : fmt(day)}.{' '}
        {short > 0 && (
          <button type="button" className="link-btn" onClick={onOpenCoach}>
            Exercises to fill them ›
          </button>
        )}
      </p>
    </section>
  )
}
