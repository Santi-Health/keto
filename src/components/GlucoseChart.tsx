import type { Reading } from '../lib/cgm'
import type { Exercise } from '../lib/exercise'
import type { LogEntry } from '../lib/foods'
import { RANGE, eatingEvents } from '../lib/glucoseInsights'

interface Props {
  day: string
  readings: Reading[]
  logs: LogEntry[]
  exercises: Exercise[]
}

const W = 360
const H = 180
const PAD = { l: 30, r: 8, t: 10, b: 22 }
const Y_MIN = 50
const Y_MAX = 220

/** One day of glucose with the 70–140 band, meals (▲) and workouts (shaded). */
export function GlucoseChart({ day, readings, logs, exercises }: Props) {
  const start = new Date(`${day}T00:00:00`).getTime()
  const x = (t: number) => PAD.l + ((t - start) / 86_400_000) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (Math.min(Math.max(v, Y_MIN), Y_MAX) - Y_MIN) / (Y_MAX - Y_MIN)) * (H - PAD.t - PAD.b)
  // Break the line where readings are missing for more than 20 minutes.
  const segments: Reading[][] = []
  for (const r of readings) {
    const seg = segments[segments.length - 1]
    if (seg && r.t - seg[seg.length - 1].t <= 20 * 60_000) seg.push(r)
    else segments.push([r])
  }
  const events = eatingEvents(logs)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="glucose-chart" role="img" aria-label={`Glucose for ${day}`}>
      <rect x={PAD.l} y={y(RANGE.high)} width={W - PAD.l - PAD.r} height={y(RANGE.low) - y(RANGE.high)} fill="var(--accent-soft)" />
      {[70, 140, 180].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={v === 180 ? '3 3' : undefined} />
          <text x={PAD.l - 4} y={y(v) + 3} textAnchor="end" fontSize="8" fill="var(--text-2)">
            {v}
          </text>
        </g>
      ))}
      {[0, 6, 12, 18, 24].map((h) => (
        <text key={h} x={x(start + h * 3_600_000)} y={H - 6} textAnchor="middle" fontSize="8" fill="var(--text-2)">
          {h === 0 || h === 24 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}
        </text>
      ))}
      {exercises.map((e) => {
        const s = Date.parse(e.started_at)
        return (
          <rect
            key={e.id}
            x={x(s)}
            y={PAD.t}
            width={Math.max(2, x(s + e.duration_min * 60_000) - x(s))}
            height={H - PAD.t - PAD.b}
            fill="var(--protein)"
            opacity={0.15}
          />
        )
      })}
      {segments.map((seg, i) => (
        <polyline
          key={i}
          fill="none"
          stroke="var(--carbs)"
          strokeWidth="1.8"
          strokeLinejoin="round"
          points={seg.map((r) => `${x(r.t).toFixed(1)},${y(r.v).toFixed(1)}`).join(' ')}
        />
      ))}
      {events.map((ev) => {
        const t = Date.parse(ev[0].eaten_at)
        const cx = x(t)
        return (
          <g key={ev[0].id}>
            <line x1={cx} x2={cx} y1={PAD.t} y2={H - PAD.b} stroke="var(--fat)" strokeWidth="1" opacity="0.5" />
            <path d={`M${cx - 4} ${H - PAD.b} L${cx + 4} ${H - PAD.b} L${cx} ${H - PAD.b - 7} Z`} fill="var(--fat)" />
          </g>
        )
      })}
    </svg>
  )
}
