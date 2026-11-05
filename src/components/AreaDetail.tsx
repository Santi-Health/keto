import type { ReactNode } from 'react'
import { MIN_BASELINE_DAYS, areaAdvice, areaInsight, fmtAmount, hasTip, type Area, type AreaView } from '../lib/areas'
import { unshout } from '../lib/quickFoods'

/** Longer lists (mostly the 7-day view) stop here and add up the rest. */
const MAX_FOODS = 8

const ICON = { add: '＋', trim: '−', swap: '⇄', note: '→' } as const

/** The foods behind an area, how it compares with your usual, and what to change. */
export function AreaDetail({ area, view }: { area: Area; view: AreaView }) {
  const insight = areaInsight(area, view)
  const advice = areaAdvice(area, view, insight)
  const scope = area.weekly || view.isWeek ? 'over 7 days' : view.isToday ? 'today' : 'that day'
  const missing = [...new Set(insight.parts.flatMap((p) => p.missing))]
  return (
    <div className="watch-detail">
      <div className="muted">{area.why}</div>

      <h3>Compared with your usual</h3>
      {insight.lines.length > 0 ? (
        insight.lines.map((l) => <div key={l}>{unshout(l)}</div>)
      ) : (
        <div className="muted">
          Needs {MIN_BASELINE_DAYS} logged days in the 4 weeks before this, and there {insight.loggedDays === 1 ? 'is' : 'are'} {insight.loggedDays}.
        </div>
      )}

      {insight.parts.map((p) => {
        const foods = p.foods.filter((f) => f.pct > 0)
        const rest = foods.slice(MAX_FOODS)
        return (
          <div key={p.label}>
            <h3>
              <span>
                {p.label} {scope}
              </span>
              <span>{fmtAmount(p.total, p.unit)}</span>
            </h3>
            {foods.length === 0 && <div className="muted">Nothing logged has any.</div>}
            {foods.slice(0, MAX_FOODS).map((f) => (
              <div key={f.name} className="watch-food">
                <span>{unshout(f.name)}</span>
                <span className="muted">
                  {fmtAmount(f.amount, p.unit)} · {f.pct}%
                </span>
              </div>
            ))}
            {rest.length > 0 && (
              <div className="watch-food muted">
                <span>{rest.length} more</span>
                <span>{fmtAmount(rest.reduce((a, f) => a + f.amount, 0), p.unit)}</span>
              </div>
            )}
          </div>
        )
      })}
      {missing.length > 0 && <p className="muted small" style={{ margin: '8px 0 0' }}>No data, so counted as 0: {missing.map(unshout).join(', ')}.</p>}

      <h3>What to change</h3>
      {advice.length > 0 ? (
        <div className="tips">
          {advice.map((t) => (
            <div key={t.text} className={`tip ${t.kind}`}>
              <span className="tip-icon" aria-hidden="true">
                {ICON[t.kind]}
              </span>
              <span>
                {t.kind === 'note' ? t.text : <b>{t.text}</b>}
                {t.effect && <span className="muted small">{t.effect}</span>}
                {t.warning && <span className="tip-warn small">⚠ {t.warning}</span>}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="muted">Nothing to change right now.</div>
      )}
    </div>
  )
}

interface TapProps {
  area: Area
  view: AreaView
  open: boolean
  onToggle: () => void
  children: ReactNode
}

/** Makes a ring or bar open its detail; the dot means there's a suggestion inside. */
export function Tap({ area, view, open, onToggle, children }: TapProps) {
  return (
    <button type="button" className={`tap ${hasTip(area, view) ? 'has-tip' : ''}`} aria-expanded={open} aria-label={`${area.label} details`} onClick={onToggle}>
      {children}
    </button>
  )
}
