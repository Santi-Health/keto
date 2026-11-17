import { useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { libraryFor, useCustomLifts } from '../lib/library'
import { localDate } from '../lib/targets'
import { shiftDay } from '../lib/goalPlan'

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
import { daysLeftInWeek, pastWeeks, weekCoverage, type GroupWeek, type WeekVerdict } from '../lib/training'

/** How recent a day is in the 7-day window, by days ago: today, 1–3 days, 4–5 days, and 6 days (gone tomorrow). */
export const AGE_BANDS = [
  { label: 'today', cls: 'age-0', from: 0, to: 0 },
  { label: '1–3 days', cls: 'age-1', from: 1, to: 3 },
  { label: '4–5 days', cls: 'age-2', from: 4, to: 5 },
  { label: '6 days ago (goes tomorrow)', cls: 'age-3', from: 6, to: 6 },
]

/**
 * Bars of effective sets per muscle group against the weekly sets that keep (and build) muscle. With `aged`, each
 * bar is split by how recent the sets are, oldest on the left where they'll drop off, today on the right.
 */
export function WeeklySetsBars({ coverage, aged = false }: { coverage: GroupWeek[]; aged?: boolean }) {
  return (
    <div className="coach-sets">
      {coverage.map((g) => {
        const met = g.sets >= g.target
        const scale = Math.max(g.target, g.sets)
        return (
          <div key={g.group}>
            <span>{g.group}</span>
            <span className="coach-bar" aria-hidden="true">
              {aged && g.byAge.length ? (
                [...AGE_BANDS].reverse().map((b) => {
                  const v = g.byAge.slice(b.from, b.to + 1).reduce((a, x) => a + x, 0)
                  return v > 0 ? <span key={b.cls} className={`age ${b.cls}`} style={{ width: `${(v / scale) * 100}%` }} /> : null
                })
              ) : (
                <span style={{ width: `${Math.min(100, (g.sets / g.target) * 100)}%`, background: met ? 'var(--accent)' : 'var(--protein)' }} />
              )}
            </span>
            <span className={`muted small ${aged && met ? 'set-met' : ''}`}>
              {g.sets}/{g.target}
            </span>
          </div>
        )
      })}
      {aged && (
        <div className="age-legend muted small">
          {AGE_BANDS.map((b) => (
            <span key={b.cls}>
              <i className={`age-key ${b.cls}`} /> {b.label}
            </span>
          ))}
        </div>
      )}
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
export function WeeklySetsCard({ day, onOpenCoach, weightKg }: { day: string; onOpenCoach: () => void; weightKg?: number }) {
  const { exercises } = useData()
  const { custom } = useCustomLifts()
  const library = useMemo(() => libraryFor(undefined, custom), [custom])
  const coverage = useMemo(() => weekCoverage(exercises, library, day, undefined, weightKg), [exercises, library, day, weightKg])
  const history = useMemo(() => pastWeeks(exercises, library, day, 6, weightKg), [exercises, library, day, weightKg])
  const [open, setOpen] = useState<string | null>(null)
  const short = coverage.filter((g) => g.sets < g.target).length
  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 8 }}>
        <h2>Effective sets, last 7 days</h2>
        <span className={`badge ${short ? '' : 'ok'}`}>{short ? `${short} group${short === 1 ? '' : 's'} short` : 'All covered'}</span>
      </div>
      <WeeklySetsBars coverage={coverage} aged />
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
