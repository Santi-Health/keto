import { useEffect, useId, useState } from 'react'
import type { ActivityDay } from '../lib/activity'
import { deficitSoFar } from '../lib/deficit'
import type { Exercise } from '../lib/exercise'
import type { LogEntry } from '../lib/foods'

interface Props {
  day: string
  bmr: number
  logs: LogEntry[]
  exercises: Exercise[]
  activity: ActivityDay | null
  /** The deficit the calorie target aims for today, in kcal. */
  goal: number | null
  /** Today's calorie target, shown under what's been eaten. */
  calorieLimit: number | null
}

const fmt = (n: number) => Math.abs(n).toLocaleString()
const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const hourLabel = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`)

/** A smooth line through the points that never overshoots them (monotone cubic). */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 3) return pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const slope = (i: number) => (pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0])
  const m = pts.map((_, i) => {
    if (i === 0) return slope(0)
    if (i === pts.length - 1) return slope(i - 1)
    const a = slope(i - 1)
    const b = slope(i)
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b)
  })
  let out = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    const h = (x1 - x0) / 3
    out += ` C${(x0 + h).toFixed(1)},${(y0 + m[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - m[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
  }
  return out
}

/** Burned minus eaten so far today, updated every minute, with how it built up hour by hour. */
export function DeficitNow({ day, bmr, logs, exercises, activity, goal, calorieLimit }: Props) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const d = deficitSoFar({ day, now, bmr, logs, exercises, activity })
  const surplus = d.deficit < 0

  // Line of the running deficit across the day, on a 24-hour axis. Up is a bigger deficit.
  const W = 300
  const H = 112
  const left = 40
  const right = 8
  const top = 10
  const bottom = 16
  const values = d.hours.map((p) => p.deficit)
  const hi = Math.max(...values)
  const lo = Math.min(...values)
  const max = Math.max(0, hi, goal ?? 0)
  const min = Math.min(0, lo)
  const x = (h: number) => left + ((h + 1) / 24) * (W - left - right)
  const y = (v: number) => top + ((max - v) / (max - min || 1)) * (H - top - bottom)
  const path = smoothPath(d.hours.map((p) => [x(p.hour), y(p.deficit)]))
  const last = d.hours[d.hours.length - 1]
  // Same signs as the big number: − for a deficit, + for a surplus.
  const signed = (v: number) => `${v > 0 ? '−' : v < 0 ? '+' : ''}${fmt(v)}`
  // Axis marks: zero, the day's highest and lowest; one is dropped when it would overlap another.
  const ticks: { v: number; label: string }[] = [{ v: 0, label: '0' }]
  for (const [v, name] of [[hi, 'max'], [lo, 'min']] as const) {
    if (v !== 0 && ticks.every((t) => Math.abs(y(t.v) - y(v)) >= 11)) ticks.push({ v, label: `${signed(v)} ${name}` })
  }
  const [hover, setHover] = useState<number | null>(null)
  const gid = useId()
  const shown = hover != null ? d.hours[hover] : null

    const toGoal = goal != null && goal > 0 ? goal - d.deficit : null
  const goalPct = goal != null && goal > 0 ? Math.max(0, Math.min(1, d.deficit / goal)) : null
  const area = last ? `${path} L${x(last.hour).toFixed(1)},${y(0).toFixed(1)} L${x(d.hours[0].hour).toFixed(1)},${y(0).toFixed(1)} Z` : ''

  return (
    <>
      <section className="card deficit-summary">
        <div className="deficit-stat">
          <div className="deficit-big" style={{ color: 'var(--accent)' }}>
            {d.burned.toLocaleString()} <span className="deficit-unit">kcal</span>
          </div>
          <div className="muted small">Burned</div>
        </div>
        <div className="deficit-stat end wide">
          <div className="deficit-mid" style={{ color: surplus ? 'var(--warn)' : 'var(--accent)' }}>
            {fmt(d.deficit)} <span className="deficit-unit">kcal</span>
          </div>
          <div className="muted small">{surplus ? 'Surplus' : 'Deficit'} so far</div>
        </div>
        <div className="deficit-stat">
          <div className="deficit-big" style={{ color: 'var(--warn)' }}>
            {d.eaten.toLocaleString()} <span className="deficit-unit">kcal</span>
          </div>
          <div className="muted small">
            Eaten
            {calorieLimit != null && (
              <span style={d.eaten > calorieLimit ? { color: 'var(--warn)' } : undefined}>
                {' '}· limit {Math.round(calorieLimit).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="deficit-stat end">
          {toGoal == null ? (
            <div className="deficit-mid">—</div>
          ) : toGoal <= 0 ? (
            <div className="deficit-mid" style={{ color: 'var(--accent)' }}>✓</div>
          ) : (
            <div className="deficit-mid" style={{ color: 'var(--accent)' }}>{toGoal.toLocaleString()}</div>
          )}
          <div className="muted small">{toGoal == null ? 'No goal' : toGoal <= 0 ? 'Goal reached' : 'To goal'}</div>
        </div>
        <div
          className="deficit-badge"
          style={{ ['--pct' as string]: `${(goalPct ?? 0) * 360}deg` }}
          role="img"
          aria-label={goal ? `${Math.round((goalPct ?? 0) * 100)}% of today's ${goal} kcal deficit goal` : undefined}
        >
          <div>
            <b style={{ color: surplus ? 'var(--warn)' : 'var(--accent)' }}>{surplus ? '+' : ''}{fmt(d.deficit)}</b>
            <span>kcal</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Daily chart</h2>
        {d.hours.length > 1 ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="deficit-chart" role="img" aria-label={`Deficit by hour, now ${d.deficit} kcal`} onMouseLeave={() => setHover(null)}>
            <defs>
              <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--calories)" stopOpacity="0.45" />
                <stop offset="1" stopColor="var(--calories)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t.label}>
                <line x1={left} x2={W - right} y1={y(t.v)} y2={y(t.v)} stroke="var(--track)" strokeWidth={t.v === 0 ? 1.5 : 1} />
                <text x={left - 4} y={y(t.v) + 3} textAnchor="end" fontSize="8.5" fill="var(--text-2)">
                  {t.label}
                </text>
              </g>
            ))}
            {goal != null && goal > 0 && (
              <>
                <line x1={left} x2={W - right} y1={y(goal)} y2={y(goal)} stroke="var(--text-2)" strokeWidth="1" strokeDasharray="3 3" />
                <text x={W - right} y={y(goal) - 3} textAnchor="end" fontSize="8.5" fill="var(--text-2)">
                  goal {signed(goal)}
                </text>
              </>
            )}
            {[6, 12, 18].map((h) => (
              <text key={h} x={x(h - 1)} y={H - 3} textAnchor="middle" fontSize="8.5" fill="var(--text-2)">
                {h === 12 ? 'noon' : hourLabel(h)}
              </text>
            ))}
            <path d={area} fill={`url(#${gid})`} stroke="none" />
            <path d={path} fill="none" stroke="var(--calories)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
            {last && (
              <>
                <circle cx={x(last.hour)} cy={y(last.deficit)} r="5" fill="var(--calories)" stroke="var(--surface)" strokeWidth="2" />
                <text
                  // Above the dot, or to its left when the dot is at the top or the right edge.
                  x={y(last.deficit) < top + 14 || x(last.hour) > W - 40 ? x(last.hour) - 9 : x(last.hour)}
                  y={y(last.deficit) < top + 14 ? y(last.deficit) + 3 : y(last.deficit) - 9}
                  textAnchor={y(last.deficit) < top + 14 || x(last.hour) > W - 40 ? 'end' : 'middle'}
                  fontSize="9.5"
                  fontWeight="700"
                  fill="var(--text)"
                >
                  Now {signed(last.deficit)}
                </text>
              </>
            )}
            {shown && <circle cx={x(shown.hour)} cy={y(shown.deficit)} r="5" fill="var(--calories)" stroke="var(--surface)" strokeWidth="2" />}
            {d.hours.map((p, i) => (
              <rect key={p.hour} x={x(p.hour) - (W - left - right) / 48} y={0} width={(W - left - right) / 24} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            ))}
          </svg>
        ) : (
          <p className="muted small">The chart starts after the first hour of the day.</p>
        )}
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          {shown
            ? `By ${hourLabel((shown.hour + 1) % 24)}: burned ${shown.burned.toLocaleString()}, eaten ${shown.eaten.toLocaleString()}, ${shown.deficit >= 0 ? 'deficit' : 'surplus'} ${fmt(shown.deficit)} kcal.`
            : <>
                {d.byMidnight >= 0 ? `About ${fmt(d.byMidnight)} kcal deficit by midnight if you eat nothing more` : `About ${fmt(d.byMidnight)} kcal surplus by midnight even with nothing more`}
                {goal != null && goal > 0 && ` (today's goal: ${goal.toLocaleString()}, dashed line)`}.{' '}
                {d.burnSource === 'fitbit'
                  ? `Burn is Fitbit's total at ${time(d.fitbitAt!)}, then estimated since.`
                  : 'Burn is estimated from your resting burn and logged workouts; import from Fitbit for the real number.'}
              </>}
        </p>
      </section>
    </>
  )
}
