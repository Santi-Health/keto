import { useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { libraryFor, useCustomLifts } from '../lib/library'
import { localDate } from '../lib/targets'
import { shiftDay } from '../lib/goalPlan'

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
import { daysLeftInWeek, pastWeeks, weekCoverage, type GroupWeek, type WeekVerdict } from '../lib/training'

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

const VERDICT: Record<WeekVerdict, { mark: string; label: string; cls: string }> = {
  good: { mark: '✓', label: 'Good week', cls: 'good' },
  close: { mark: '◐', label: 'Close', cls: 'close' },
  behind: { mark: '✗', label: 'Behind', cls: 'behind' },
}
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
/** "Nov 2–8", or "Oct 26 – Nov 1" across months. */
const range = (a: string, b: string) => (a.slice(0, 7) === b.slice(0, 7) ? `${shortDate(a)}–${Number(b.slice(8))}` : `${shortDate(a)} – ${shortDate(b)}`)

/** Today's card: sets per muscle group in the Monday–Sunday week, past weeks with a check, and a link to what to train. */
export function WeeklySetsCard({ day, onOpenCoach }: { day: string; onOpenCoach: () => void }) {
  const { exercises } = useData()
  const { custom } = useCustomLifts()
  const library = useMemo(() => libraryFor(undefined, custom), [custom])
  const coverage = useMemo(() => weekCoverage(exercises, library, day), [exercises, library, day])
  const history = useMemo(() => pastWeeks(exercises, library, day, 6), [exercises, library, day])
  const [open, setOpen] = useState<string | null>(null)
  const short = coverage.filter((g) => g.sets < g.target).length
  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 8 }}>
        <h2>Sets, last 7 days</h2>
        <span className={`badge ${short ? '' : 'ok'}`}>{short ? `${short} group${short === 1 ? '' : 's'} short` : 'All covered'}</span>
      </div>
      <WeeklySetsBars coverage={coverage} />
      <p className="muted small" style={{ marginBottom: 0 }}>
        Last 7 days, {fmt(shiftDay(day, -6))} to {day === localDate() ? 'today' : fmt(day)}. This week (Mon–Sun) gets its check after Sunday
        {day === localDate() ? (daysLeftInWeek(day) ? `, ${daysLeftInWeek(day)} day${daysLeftInWeek(day) === 1 ? '' : 's'} away` : ', tonight') : ''}.{' '}
        {short > 0 && (
          <button type="button" className="link-btn" onClick={onOpenCoach}>
            Exercises to fill them ›
          </button>
        )}
      </p>

      {history.length > 0 && <div className="section-label">Past weeks</div>}
      <div className="past-weeks">
        {history.map((w) => {
          const v = VERDICT[w.verdict]
          return (
            <div key={w.start}>
              <button type="button" className={`past-week ${v.cls}`} aria-expanded={open === w.start} onClick={() => setOpen(open === w.start ? null : w.start)}>
                <span className="past-mark" aria-label={v.label}>
                  {v.mark}
                </span>
                <span>{range(w.start, w.end)}</span>
                <span className="muted small">
                  {w.groupsMet}/{w.groups} groups · {w.sets}/{w.targetSets} sets
                </span>
              </button>
              {open === w.start && (
                <div className="past-week-detail">
                  <WeeklySetsBars coverage={w.coverage} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      {history.length > 0 && <p className="muted small" style={{ marginBottom: 0 }}>
        ✓ every group hit its sets · ◐ close (5+ of 7 groups or 80% of sets) · ✗ behind. Tap a week for its bars.
      </p>}
    </section>
  )
}
