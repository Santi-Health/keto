export interface TrendSeries {
  label: string
  color: string
  values: (number | null)[]
  type: 'line' | 'bar' | 'dots'
}

interface Props {
  days: string[]
  series: TrendSeries[]
  /** Dashed reference lines, e.g. a target or a limit. */
  refs?: { value: number; label: string; color?: string }[]
  /** Lowest value on the axis; defaults to 0 for bars, near the data otherwise. */
  min?: number
  unit?: string
  title: string
}

const nice = (v: number) => {
  const p = 10 ** Math.floor(Math.log10(Math.max(Math.abs(v), 1e-9)))
  return Math.ceil(v / p) * p
}

/** Small multi-series chart for daily trends: bars, lines (gaps for missing days) and dots. */
export function TrendChart({ days, series, refs = [], min, unit = '', title }: Props) {
  const W = 320
  const H = 130
  const pad = { l: 34, r: 8, t: 8, b: 16 }
  const all = [...series.flatMap((s) => s.values), ...refs.map((r) => r.value)].filter((v): v is number => v != null)
  const hasData = series.some((s) => s.values.some((v) => v != null))
  const hasBars = series.some((s) => s.type === 'bar')
  const dataMax = all.length ? Math.max(...all) : 1
  const dataMin = all.length ? Math.min(...all) : 0
  const spread = Math.max(dataMax - dataMin, 1)
  const lo = min ?? (hasBars ? 0 : Math.floor(dataMin - spread * 0.2))
  // Bars start at 0 and round up to a clean number; lines hug the data so small changes show.
  const hi = hasBars || min != null ? nice(Math.max(dataMax * 1.08, lo + 1)) : Math.ceil(dataMax + spread * 0.2)
  const n = days.length
  const step = (W - pad.l - pad.r) / n
  const x = (i: number) => pad.l + step * (i + 0.5)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b)
  const bars = series.filter((s) => s.type === 'bar')
  const barW = Math.max(1, (step * 0.8) / Math.max(1, bars.length))
  const fmt = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10))
  const label = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <figure className="trend">
      <figcaption>
        <b>{title}</b>
        <span className="trend-legend">
          {series.map((s) => (
            <span key={s.label}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>
      {!hasData ? (
        <p className="muted small" style={{ margin: '4px 0 10px' }}>
          No data in this range yet.
        </p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="keto-chart" role="img" aria-label={title}>
          {[lo, (lo + hi) / 2, hi].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid-line" />
              <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" className="axis-text">
                {fmt(t)}
                {unit}
              </text>
            </g>
          ))}
          {refs.map((r) => (
            <g key={r.label}>
              <line x1={pad.l} x2={W - pad.r} y1={y(r.value)} y2={y(r.value)} stroke={r.color ?? 'var(--text-2)'} strokeDasharray="4 3" strokeWidth={1} />
              <text x={W - pad.r} y={y(r.value) - 3} textAnchor="end" className="axis-text">
                {r.label}
              </text>
            </g>
          ))}
          {bars.map((s, bi) =>
            s.values.map((v, i) =>
              v == null || v <= lo ? null : (
                <rect
                  key={`${s.label}${i}`}
                  x={x(i) - (barW * bars.length) / 2 + bi * barW}
                  y={y(v)}
                  width={barW * 0.9}
                  height={y(lo) - y(v)}
                  fill={s.color}
                  rx={1}
                />
              ),
            ),
          )}
          {series
            .filter((s) => s.type === 'line')
            .map((s) => {
              // Lines connect across missing days, so sparse data (weigh-ins) still reads as a trend.
              const pts = s.values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean)
              return (
                <g key={s.label}>
                  {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />}
                  {pts.length <= 31 &&
                    s.values.map((v, i) => (v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={2.2} fill={s.color} />))}
                </g>
              )
            })}
          {series
            .filter((s) => s.type === 'dots')
            .map((s) => s.values.map((v, i) => (v == null ? null : <circle key={`${s.label}${i}`} cx={x(i)} cy={y(v)} r={3.5} fill={s.color} />)))}
          <text x={pad.l} y={H - 3} className="axis-text">
            {label(days[0])}
          </text>
          <text x={W - pad.r} y={H - 3} textAnchor="end" className="axis-text">
            {label(days[n - 1])}
          </text>
        </svg>
      )}
    </figure>
  )
}
