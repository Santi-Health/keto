import { useMemo } from 'react'
import { formatSleep, type ActivityDay } from '../lib/activity'
import { useData } from '../lib/data'
import { addNutrients } from '../lib/nutrients'
import { READINESS_TEXT, readinessFor } from '../lib/readiness'
import { localDate } from '../lib/targets'

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return localDate(d)
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Steps, sleep, resting heart rate, and the last 7 days of calories eaten vs. burned (from Fitbit). */
export function ActivityCard({ days, onImport, importing }: { days: string[]; onImport: () => void; importing: boolean }) {
  const { activity, logsOn } = useData()
  const today = localDate()
  const last = days[days.length - 1]
  const isToday = days.length === 1 && last === today
  const isWeek = days.length > 1
  // One day shows that day; a week shows the per-day averages.
  const t: Partial<ActivityDay> | undefined = useMemo(() => {
    if (!isWeek) return activity[last]
    const rows = days.map((d) => activity[d]).filter((a): a is ActivityDay => !!a)
    const mean = (get: (a: ActivityDay) => number | null) => {
      const xs = rows.map(get).filter((x): x is number => x != null && x > 0)
      return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null
    }
    return { steps: mean((a) => a.steps), sleep_minutes: mean((a) => a.sleep_minutes), resting_hr: mean((a) => a.resting_hr), calories_out: mean((a) => a.calories_out), meta: {} }
  }, [isWeek, activity, days, last])
  // The chart covers the 7 days before today, or the 7 days ending on the day being viewed.
  const week = useMemo(() => (isToday ? Array.from({ length: 7 }, (_, i) => shift(today, i - 7)) : Array.from({ length: 7 }, (_, i) => shift(last, i - 6))), [isToday, today, last])
  const rows = week.map((day) => ({ day, a: activity[day] as ActivityDay | undefined, eaten: addNutrients(logsOn(day).map((l) => l.nutrients)).kcal }))
  const rhrWeek = avg(rows.map((r) => r.a?.resting_hr).filter((x): x is number => x != null))
  const sleepWeek = avg(rows.map((r) => r.a?.sleep_minutes).filter((x): x is number => x != null && x > 0))
  const balance = rows.filter((r) => (r.a?.calories_out ?? 0) > 1200 && r.eaten > 0)
  const avgGap = avg(balance.map((r) => r.a!.calories_out! - r.eaten))
  const max = Math.max(2500, ...rows.map((r) => Math.max(r.a?.calories_out ?? 0, r.eaten)))

  if (!Object.keys(activity).length)
    return (
      <section className="card">
        <h2>Activity &amp; sleep</h2>
        <p className="muted small">Steps, sleep, resting heart rate and calories burned come from Fitbit through Google Health.</p>
        <button type="button" className="btn secondary" onClick={onImport} disabled={importing}>
          {importing ? 'Importing…' : '⌚ Import from Fitbit'}
        </button>
      </section>
    )

  return (
    <section className="card">
      <h2>Activity &amp; sleep</h2>
      <ReadinessBlock days={days} isWeek={isWeek} />
      <div className="stat-grid two-col">
        <div>
          <b>{t?.steps != null ? t.steps.toLocaleString() : '—'}</b>
          <span>{isToday ? 'Steps today' : isWeek ? 'Steps/day avg' : 'Steps'}</span>
        </div>
        <div>
          <b>{t?.sleep_minutes ? formatSleep(t.sleep_minutes) : '—'}</b>
          <span>
            {isWeek ? 'Sleep avg' : isToday ? 'Sleep last night' : 'Sleep the night before'}
            {sleepWeek != null && !isWeek ? ` · 7-day ${formatSleep(sleepWeek)}` : ''}
          </span>
        </div>
        <div>
          <b>{t?.resting_hr ?? '—'}</b>
          <span>Resting HR{rhrWeek != null && !isWeek ? ` · 7-day ${Math.round(rhrWeek)}` : isWeek ? ' avg' : ''}</span>
        </div>
        <div>
          <b>{t?.calories_out != null ? t.calories_out.toLocaleString() : '—'}</b>
          <span>{isToday ? 'kcal burned so far' : isWeek ? 'kcal burned/day avg' : 'kcal burned'}</span>
        </div>
      </div>
      {t?.meta?.deepMin != null && (
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          {isToday ? 'Last night' : 'That night'}: {t.meta.deepMin} min deep · {t.meta.remMin ?? 0} min REM · {t.meta.lightMin ?? 0} min light · awake {t.meta.awakeMin ?? 0} min
          {t.sleep_minutes != null && t.sleep_minutes < 360 ? '. Under 6 h of sleep tends to raise appetite and morning glucose.' : '.'}
        </p>
      )}

      <div className="section-label">Eaten vs. burned, {isToday ? 'last 7 days' : `7 days to ${new Date(`${last}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</div>
      <div className="burn-chart" role="img" aria-label="Calories eaten and burned per day">
        {rows.map((r) => (
          <div key={r.day} className="burn-day">
            <div className="burn-bars">
              <span className="burn-out" style={{ height: `${((r.a?.calories_out ?? 0) / max) * 100}%` }} />
              <span className="burn-in" style={{ height: `${(r.eaten / max) * 100}%` }} />
            </div>
            <span className="burn-label">{new Date(`${r.day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
          </div>
        ))}
      </div>
      <p className="muted small" style={{ margin: '4px 0 0' }}>
        <span style={{ color: 'var(--text-2)' }}>■</span> burned · <span style={{ color: 'var(--calories)' }}>■</span> eaten
        {avgGap != null &&
          ` · on ${balance.length} fully logged day${balance.length > 1 ? 's' : ''}, you ate ${Math.abs(Math.round(avgGap)).toLocaleString()} kcal ${avgGap >= 0 ? 'under' : 'over'} your burn on average`}
      </p>
    </section>
  )
}

/** The app's readiness score for the day (or the week's average), with what drove it. */
function ReadinessBlock({ days, isWeek }: { days: string[]; isWeek: boolean }) {
  const { activity } = useData()
  const scores = days.map((d) => readinessFor(d, activity)).filter((r): r is NonNullable<typeof r> => !!r)
  if (!scores.length) return null
  const r = scores[scores.length - 1]
  const score = isWeek ? Math.round(scores.reduce((a, b) => a + b.score, 0) / scores.length) : r.score
  const band = score >= 70 ? 'high' : score >= 45 ? 'moderate' : 'low'
  return (
    <div className={`readiness ${band}`}>
      <div className="readiness-score">
        <b>{score}</b>
        <span>{isWeek ? `readiness avg (${scores.length} days)` : 'readiness'}</span>
      </div>
      <div className="readiness-detail">
        {!isWeek && <div className="small">{READINESS_TEXT[band]}</div>}
        {isWeek ? (
          <div className="readiness-days">
            {days.map((d) => {
              const x = readinessFor(d, activity)
              return (
                <span key={d} className={x ? (x.score >= 70 ? 'high' : x.score >= 45 ? 'moderate' : 'low') : ''} title={d}>
                  {x?.score ?? '–'}
                </span>
              )
            })}
          </div>
        ) : (
          <ul className="readiness-parts">
            {r.parts.map((p) => (
              <li key={p.label}>
                <b>{p.label}</b> {p.score}: {p.detail}
              </li>
            ))}
          </ul>
        )}
        <div className="muted small">
          The app's own score from HRV, resting heart rate and sleep against your last 30 days (Fitbit's Readiness isn't shared with apps).
          {!isWeek && r.missing.length ? ` No ${r.missing.join(' or ')} data yet.` : ''}
        </div>
      </div>
    </div>
  )
}
