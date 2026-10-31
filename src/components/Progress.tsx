import { Molecule, type MoleculeKey } from './Molecules'

interface RingProps {
  label: string
  value: number
  target: number | null
  unit: string
  color: string
  /** Carbs are a limit: going over is bad, not good. */
  isLimit?: boolean
  /** Replaces the label under the ring. */
  caption?: string
  molecule?: MoleculeKey
}

export function Ring({ label, value, target, unit, color, isLimit, caption, molecule }: RingProps) {
  const r = 40
  const c = 2 * Math.PI * r
  const pct = target ? Math.min(value / target, 1) : 0
  const over = isLimit && target != null && value > target
  return (
    <div className="ring">
      <svg viewBox="0 0 100 100" role="img" aria-label={`${label}: ${value} of ${target ?? '?'} ${unit}`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--track)" strokeWidth="10" />
        {pct > 0 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={over ? 'var(--warn)' : color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${pct * c} ${c}`}
            transform="rotate(-90 50 50)"
          />
        )}
        <text x="50" y="55" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--text)">
          {Math.round(value)}
        </text>
      </svg>
      {molecule && <Molecule molecule={molecule} size={46} showFormula />}
      <div className="ring-value">
        {target != null ? `${target}${unit}` : '—'}
      </div>
      <div className="ring-label">{caption ?? (isLimit ? `${label} limit` : label)}</div>
    </div>
  )
}

interface BarProps {
  label: string
  value: number
  target: number
  unit: string
  color?: string
  molecule?: MoleculeKey
}

export function Bar({ label, value, target, unit, color, molecule }: BarProps) {
  const pct = Math.min(value / target, 1) * 100
  return (
    <div className="bar-row">
      <div className="bar-head">
        <span className="bar-label">
          {molecule && <Molecule molecule={molecule} size={molecule === 'fiber' ? 36 : 28} />}
          {label}
        </span>
        <span className="muted">
          {Math.round(value).toLocaleString()} / {target.toLocaleString()} {unit}
        </span>
      </div>
      <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemax={target} aria-label={label}>
        <span style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
