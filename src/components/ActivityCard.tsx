import { useMemo, useState } from 'react'
import { formatSleep, type ActivityDay } from '../lib/activity'
import { useData } from '../lib/data'
import { addNutrients } from '../lib/nutrients'
import { ILLNESS_TEXT, READINESS_TEXT, readinessFor } from '../lib/readiness'
import { localDate } from '../lib/targets'

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return localDate(d)
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Steps, sleep, resting heart rate, and the last 7 days of calories eaten vs. burned (from Fitbit). */
export function ActivityCard({ days, onImport, importing, hideReadiness }: { days: string[]; onImport: () => void; importing: boolean; hideReadiness?: boolean }) {
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
      {!hideReadiness && <ReadinessBlock days={days} isWeek={isWeek} />}
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

const SEEN_KEY = 'keto:readinessSeen'
const seenOn = () => {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

/** Whether today's readiness is still waiting to be seen at the top of Today (until you tap it away). */
export function useMorningReadiness(): [boolean, () => void] {
  const { activity } = useData()
  const today = localDate()
  const [seen, setSeen] = useState(seenOn)
  // Last night's sleep is enough to show it; the score joins once HRV or resting heart rate arrive.
  const show = seen !== today && (!!readinessFor(today, activity) || !!activity[today]?.sleep_minutes)
  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, today)
    } catch {
      /* private mode: it just goes away for this visit */
    }
    setSeen(today)
  }
  return [show, dismiss]
}

/** This morning's readiness and last night's sleep, first thing on Today. Tap to move it down to Activity & sleep. */
export function MorningReadiness({ onDone }: { onDone: () => void }) {
  const { activity } = useData()
  const today = localDate()
  const a = activity[today]
  return (
    <section className="card morning-ready">
      <h2>Good morning</h2>
      <ReadinessBlock days={[today]} isWeek={false} />
      {a?.sleep_minutes ? (
        <p className="muted small" style={{ margin: '8px 0 0' }}>
          ☾ Slept <b>{formatSleep(a.sleep_minutes)}</b>
          {a.meta?.deepMin != null && ` · ${a.meta.deepMin} min deep · ${a.meta.remMin ?? 0} min REM · awake ${a.meta.awakeMin ?? 0} min`}
        </p>
      ) : null}
      <button type="button" className="btn secondary" style={{ marginTop: 10 }} onClick={onDone}>
        Got it ✓ <span className="muted small">(moves down to Activity &amp; sleep)</span>
      </button>
    </section>
  )
}

const BAND_TITLE = { high: 'Well recovered', moderate: 'Moderately recovered', low: 'Low recovery' } as const
const bandOf = (score: number) => (score >= 70 ? 'high' : score >= 45 ? 'moderate' : 'low')
/** The advice half of the readiness text ("Train as planned, …"), capitalized. */
const advice = (band: 'high' | 'moderate' | 'low') => {
  const a = READINESS_TEXT[band].split(': ')[1] ?? READINESS_TEXT[band]
  return a.charAt(0).toUpperCase() + a.slice(1)
}
const PART_ICON: Record<string, string> = { HRV: '〰', 'Resting HR': '♥', Sleep: '☾' }

/** A 270° gauge with the score in the middle, colored by how recovered you are. */
function Gauge({ score, label }: { score: number; label: string }) {
  const r = 46
  const c = 2 * Math.PI * r
  const arc = c * 0.75
  const band = bandOf(score)
  return (
    <svg viewBox="0 0 120 120" className={`ready-gauge ${band}`} role="img" aria-label={`Readiness ${score} out of 100`}>
      <defs>
        <linearGradient id={`ready-grad-${band}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" className="stop-a" />
          <stop offset="100%" className="stop-b" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r={r} className="ready-track" strokeDasharray={`${arc} ${c}`} transform="rotate(135 60 60)" />
      <circle
        cx="60"
        cy="60"
        r={r}
        className="ready-arc"
        stroke={`url(#ready-grad-${band})`}
        strokeDasharray={`${(arc * score) / 100} ${c}`}
        transform="rotate(135 60 60)"
      />
      <text x="60" y="62" textAnchor="middle" className="ready-num">
        {score}
      </text>
      <text x="60" y="80" textAnchor="middle" className="ready-label">
        {label}
      </text>
    </svg>
  )
}

/** The app's readiness score for the day (or the week's average), with what drove it. */
function ReadinessBlock({ days: shown, isWeek }: { days: string[]; isWeek: boolean }) {
  const { activity } = useData()
  // ‹ › steps back through earlier days (one day at a time, not in the week view).
  const [back, setBack] = useState(0)
  const days = isWeek || !back ? shown : [shift(shown[0], -back)]
  const scores = days.map((d) => ({ day: d, r: readinessFor(d, activity) }))
  const known = scores.filter((x): x is { day: string; r: NonNullable<typeof x.r> } => !!x.r)
  const nav = !isWeek && (
    <div className="ready-nav">
      <button type="button" className="icon-btn" aria-label="Previous day" disabled={!activity[shift(days[0], -1)]} onClick={() => setBack(back + 1)}>
        ‹
      </button>
      <span>{back ? new Date(`${days[0]}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Readiness'}</span>
      <button type="button" className="icon-btn" aria-label="Next day" disabled={!back} onClick={() => setBack(back - 1)}>
        ›
      </button>
    </div>
  )
  if (back && !known.length)
    return (
      <div className="ready">
        {nav}
        <p className="muted small" style={{ margin: 0 }}>No readiness for this day (not enough Fitbit data).</p>
      </div>
    )
  if (!known.length) {
    // Today before Fitbit has finished syncing: say what the score is waiting for instead of showing nothing.
    const a = !isWeek && days[0] === localDate() ? activity[days[0]] : undefined
    if (!a) return null
    const waiting = [a.meta?.hrvMs == null && 'HRV', a.resting_hr == null && 'resting heart rate', !a.sleep_minutes && 'sleep'].filter(Boolean)
    return <p className="muted small" style={{ margin: '0 0 8px' }}>Readiness shows once Fitbit syncs {waiting.length ? waiting.join(' and ') : 'a few more days of history'}.</p>
  }
  const r = known[known.length - 1].r
  const score = isWeek ? Math.round(known.reduce((a, b) => a + b.r.score, 0) / known.length) : r.score
  const band = bandOf(score)
  return (
    <div className={`ready ${band}`}>
      {nav}
      <div className="ready-top">
        <Gauge score={score} label={isWeek ? '7-day avg' : 'readiness'} />
        <div className="ready-head">
          <b>{!isWeek && r.illness ? 'Possible illness' : BAND_TITLE[band]}</b>
          {!isWeek && !back && <span>{r.illness ? ILLNESS_TEXT : advice(band)}</span>}
          {!isWeek && r.illness && <span className="ready-cap">Held at {r.illness.cap} by your {r.illness.signs.join(' and ')}, off your normal.</span>}
          {!isWeek && r.cappedBySleep && (
            <span className="ready-cap">
              Held at {r.cappedBySleep.cap} by a short night ({formatSleep(r.cappedBySleep.minutes)}).
            </span>
          )}
        </div>
      </div>
      {isWeek ? (
        <div className="ready-week">
          {scores.map(({ day: d, r: x }) => (
            <div key={d} className={`ready-day ${x ? bandOf(x.score) : ''}`}>
              <i style={{ height: `${x ? Math.max(8, x.score) : 4}%` }} />
              <b>{x?.score ?? '–'}</b>
              <span>{new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="ready-parts">
          {r.parts.map((p) => (
            <div key={p.label} className="ready-part" title={p.detail}>
              <span className="ready-part-label">
                <span aria-hidden="true">{PART_ICON[p.label]}</span> {p.label}
              </span>
              <span className="ready-bar">
                <i className={bandOf(p.score)} style={{ width: `${Math.max(4, p.score)}%` }} />
              </span>
              <span className="ready-part-value">{p.short}</span>
            </div>
          ))}
          {r.missing.length > 0 && <div className="muted small">No {r.missing.join(' or ')} data yet.</div>}
          {r.vitals.length > 0 && (
            <div className="ready-vitals" aria-label="Overnight vitals">
              {r.vitals.map((v) => (
                <span key={v.label} className={v.sign ? 'sign' : ''} title={v.detail}>
                  {v.label} <b>{v.short}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="ready-foot">The app's own score vs. your last 30 days (Fitbit's Readiness isn't shared with apps).</div>
    </div>
  )
}
