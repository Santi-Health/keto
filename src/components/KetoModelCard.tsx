import type { KetoModel } from '../lib/ketoModel'

interface Props {
  model: KetoModel
  netCarbLimit: number
  onApplyLimit: (g: number) => void
}

const CONFIDENCE = {
  none: { label: 'No readings yet', cls: '' },
  learning: { label: 'Learning', cls: '' },
  early: { label: 'Early', cls: '' },
  solid: { label: 'Solid', cls: 'ok' },
} as const

/** Prediction vs. actual for the last 30 blood readings. */
function Chart({ model }: { model: KetoModel }) {
  const pts = model.points.slice(-30)
  const W = 320
  const Hh = 150
  const pad = { l: 28, r: 8, t: 8, b: 18 }
  const max = Math.max(1.5, ...pts.flatMap((p) => [p.actual, p.population, p.personal ?? 0])) * 1.1
  const x = (i: number) => pad.l + (pts.length < 2 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (pts.length - 1))
  const y = (v: number) => pad.t + (1 - v / max) * (Hh - pad.t - pad.b)
  const ticks = [0, 0.5, 1, 1.5, 2, 3].filter((t) => t <= max)
  const personal = pts.map((p, i) => (p.personal == null ? null : `${x(i)},${y(p.personal)}`)).filter(Boolean)
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="keto-chart" role="img" aria-label="Blood ketone readings compared with predictions">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={t === 0.5 ? 'keto-line' : 'grid-line'} />
          <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" className="axis-text">
            {t}
          </text>
        </g>
      ))}
      {personal.length > 1 && <polyline points={personal.join(' ')} className="personal-line" />}
      {pts.map((p, i) => (
        <g key={p.id}>
          <circle cx={x(i)} cy={y(p.population)} r={3.5} className="pop-dot" />
          <circle cx={x(i)} cy={y(p.actual)} r={4} className="actual-dot" />
        </g>
      ))}
      {pts.length > 0 && (
        <>
          <text x={pad.l} y={Hh - 4} className="axis-text">
            {new Date(pts[0].at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
          <text x={W - pad.r} y={Hh - 4} textAnchor="end" className="axis-text">
            {new Date(pts[pts.length - 1].at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        </>
      )}
    </svg>
  )
}

export function KetoModelCard({ model, netCarbLimit, onApplyLimit }: Props) {
  const c = CONFIDENCE[model.confidence]
  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 6 }}>
        <h2 style={{ color: 'var(--ketone)' }}>Your ketosis model</h2>
        <span className={`badge ${c.cls}`}>{c.label}</span>
      </div>

      {model.n === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          Add blood ketone readings (Today → Readings → Ketones) and the estimate will learn how your body responds to carbs, fasting,
          exercise and protein. Mix it up: fasted mornings, after workouts, and the morning after a higher-carb day teach it the most.
        </p>
      ) : (
        <>
          <Chart model={model} />
          <p className="muted small" style={{ margin: '2px 0 8px' }}>
            <span style={{ color: 'var(--ketone)' }}>●</span> your reading · <span className="pop-key">○</span> general estimate ·{' '}
            <span style={{ color: 'var(--accent)' }}>—</span> your model · dashed line = 0.5 mmol/L (ketosis)
          </p>
          {model.n >= 3 && model.populationError != null && model.personalError != null ? (
            <p className="small" style={{ marginTop: 0 }}>
              Typical miss: general estimate <b>{model.populationError.toFixed(2)}</b> mmol/L, your model <b>{model.personalError.toFixed(2)}</b>{' '}
              mmol/L. Each reading is predicted by a model that hadn't seen it, so this is an honest score.
            </p>
          ) : (
            <p className="small" style={{ marginTop: 0 }}>
              {model.n} reading{model.n > 1 ? 's' : ''} so far. With so few, the model moves only part of the way toward them; accuracy shows
              from 3 readings.
            </p>
          )}
          {model.findings.length > 0 && (
            <ul className="keto-reasons">
              {model.findings.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="notice small" style={{ marginTop: 8 }}>
        <b>Personal carb limit.</b> {model.advice.text}
        {model.advice.ready && model.advice.limitG != null && model.advice.limitG !== netCarbLimit && (
          <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn small-btn" onClick={() => onApplyLimit(model.advice.limitG!)}>
              Use {model.advice.limitG} g a day
            </button>
            <span className="muted small">You can change it back anytime in Settings.</span>
          </div>
        )}
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>
        A tracking aid, not medical advice. It learns from your own readings with a simple model whose weights start at the general research
        values and move only as your data backs it up.
      </p>
    </section>
  )
}
