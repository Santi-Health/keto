import { useEffect, useState } from 'react'
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
}

const fmt = (n: number) => Math.abs(n).toLocaleString()
const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const hourLabel = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`)

/** Burned minus eaten so far today, updated every minute, with how it built up hour by hour. */
export function DeficitNow({ day, bmr, logs, exercises, activity, goal }: Props) {
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
  const path = d.hours.map((p, i) => `${i ? 'L' : 'M'}${x(p.hour).toFixed(1)},${y(p.deficit).toFixed(1)}`).join(' ')
  const last = d.hours[d.hours.length - 1]
  // Same signs as the big number: − for a deficit, + for a surplus.
  const signed = (v: number) => `${v > 0 ? '−' : v < 0 ? '+' : ''}${fmt(v)}`
  // Axis marks: zero, the day's highest and lowest; one is dropped when it would overlap another.
  const ticks: { v: number; label: string }[] = [{ v: 0, label: '0' }]
  for (const [v, name] of [[hi, 'max'], [lo, 'min']] as const) {
    if (v !== 0 && ticks.every((t) => Math.abs(y(t.v) - y(v)) >= 11)) ticks.push({ v, label: `${signed(v)} ${name}` })
  }
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover != null ? d.hours[hover] : null

  return (
    <div className="deficit-now">
      <div className="deficit-head">
        <div>
          <div className="deficit-num" style={surplus ? { color: 'var(--warn)' } : undefined}>
            {surplus ? '+' : '−'}
            {fmt(d.deficit)} <span className="deficit-unit">kcal</span>
          </div>
          <div className="small">{surplus ? 'Surplus so far today' : 'Deficit so far today'}</div>
        </div>
        <div className="deficit-side small">
          <div>
            Burned <b>{d.burned.toLocaleString()}</b>
          </div>
          <div>
            Eaten <b>{d.eaten.toLocaleString()}</b>
          </div>
        </div>
      </div>
      {d.hours.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="deficit-chart" role="img" aria-label={`Deficit by hour, now ${d.deficit} kcal`} onMouseLeave={() => setHover(null)}>
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
          <path d={path} fill="none" stroke="var(--calories)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
          {last && (
            <>
              <circle cx={x(last.hour)} cy={y(last.deficit)} r="5" fill="var(--calories)" stroke="var(--surface)" strokeWidth="2" />
              <text
                x={x(last.hour)}
                y={y(last.deficit) < top + 14 ? y(last.deficit) + 16 : y(last.deficit) - 9}
                textAnchor={x(last.hour) > W - 50 ? 'end' : 'middle'}
                fontSize="9.5"
                fontWeight="700"
                fill="var(--text)"
              >
                now {signed(last.deficit)}
              </text>
            </>
          )}
          {shown && <circle cx={x(shown.hour)} cy={y(shown.deficit)} r="5" fill="var(--calories)" stroke="var(--surface)" strokeWidth="2" />}
          {d.hours.map((p, i) => (
            <rect key={p.hour} x={x(p.hour) - (W - left - right) / 48} y={0} width={(W - left - right) / 24} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
          ))}
        </svg>
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
    </div>
  )
}
