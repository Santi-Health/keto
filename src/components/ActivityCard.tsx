import { useMemo } from 'react'
import { formatSleep, type ActivityDay } from '../lib/activity'
import { useData } from '../lib/data'
import { addNutrients } from '../lib/nutrients'
import { localDate } from '../lib/targets'

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return localDate(d)
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Steps, sleep, resting heart rate, and the last 7 days of calories eaten vs. burned (from Fitbit). */
export function ActivityCard({ onImport, importing }: { onImport: () => void; importing: boolean }) {
  const { activity, logsOn } = useData()
  const today = localDate()
  const t = activity[today]
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => shift(today, i - 7)), [today])
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
      <div className="stat-grid two-col">
        <div>
          <b>{t?.steps != null ? t.steps.toLocaleString() : '—'}</b>
          <span>Steps today</span>
        </div>
        <div>
          <b>{t?.sleep_minutes ? formatSleep(t.sleep_minutes) : '—'}</b>
          <span>
            Sleep last night
            {sleepWeek != null ? ` · 7-day ${formatSleep(sleepWeek)}` : ''}
          </span>
        </div>
        <div>
          <b>{t?.resting_hr ?? '—'}</b>
          <span>Resting HR{rhrWeek != null ? ` · 7-day ${Math.round(rhrWeek)}` : ''}</span>
        </div>
        <div>
          <b>{t?.calories_out != null ? t.calories_out.toLocaleString() : '—'}</b>
          <span>kcal burned so far</span>
        </div>
      </div>
      {t?.meta.deepMin != null && (
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          Last night: {t.meta.deepMin} min deep · {t.meta.remMin ?? 0} min REM · {t.meta.lightMin ?? 0} min light · awake {t.meta.awakeMin ?? 0} min
          {t.sleep_minutes != null && t.sleep_minutes < 360 ? '. Under 6 h of sleep tends to raise appetite and morning glucose.' : '.'}
        </p>
      )}

      <div className="section-label">Eaten vs. burned, last 7 days</div>
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
