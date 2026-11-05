import { useState } from 'react'
import { unshout } from '../lib/quickFoods'
import { watchBreakdown, type WatchItem } from '../lib/watchlist'
import type { LogEntry } from '../lib/foods'

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 1 : 0 })

/** Longer lists (mostly the 7-day view) stop here and add up the rest. */
const MAX_FOODS = 8

/** Grams keep a decimal, so the two sides of the omega ratio can be checked against it. */
const fmtAmount = (n: number, unit: string) => `${n.toLocaleString(undefined, { maximumFractionDigits: unit === 'g' || n < 10 ? 1 : 0 })} ${unit}`

function WatchDetail({ item, logs, scope }: { item: WatchItem; logs: LogEntry[]; scope: string }) {
  const parts = watchBreakdown(item.key, logs)
  const missing = [...new Set(parts.flatMap((p) => p.missing))]
  return (
    <div className="watch-detail">
      <div className="muted">{item.guidance}</div>
      {parts.map((p) => {
        const rest = p.foods.slice(MAX_FOODS)
        return (
          <div key={p.label}>
            <h3>
              <span>
                {p.label} {scope}
              </span>
              <span>{fmtAmount(p.total, p.unit)}</span>
            </h3>
            {p.foods.length === 0 && <div className="muted">Nothing logged has any.</div>}
            {p.foods.slice(0, MAX_FOODS).map((f) => (
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
    </div>
  )
}

function WatchRow({ item, open, onToggle }: { item: WatchItem; open: boolean; onToggle: () => void }) {
  const value = item.value == null ? '—' : fmt(item.value)
  const limit = item.limit == null ? '' : ` / ${fmt(item.limit)}`
  return (
    <button type="button" className="watch-row" aria-expanded={open} onClick={onToggle}>
      <span>
        <span className={`dot ${item.status}`} aria-hidden="true" />
        {item.label}
        {item.period === 'week' && <span className="muted"> (7 days)</span>}
      </span>
      <span>
        <span className={item.status === 'over' ? '' : 'muted'} style={item.status === 'over' ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>
          {value}
          {limit} {item.unit}
        </span>
        <span className="watch-chevron" aria-hidden="true">
          {open ? '▾' : '›'}
        </span>
      </span>
    </button>
  )
}

interface Props {
  items: WatchItem[]
  /** Logs of the day or days on screen. */
  logs: LogEntry[]
  /** The last 7 days, for items counted by the week. */
  weekLogs: LogEntry[]
  isWeek: boolean
  period?: string
}

/** Quiet when everything is fine; lists anything near or over its limit. Tap an item to see the foods behind it. */
export function WatchListCard({ items, logs, weekLogs, isWeek, period = 'today' }: Props) {
  const [showAll, setShowAll] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const flagged = items.filter((i) => i.status === 'near' || i.status === 'over' || i.status === 'caution')
  const shown = showAll ? items : flagged
  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 8 }}>
        <h2>Watch list</h2>
        <span className={`badge ${flagged.some((i) => i.status === 'over') ? 'warn' : flagged.length ? '' : 'ok'}`}>
          {flagged.length ? `${flagged.length} to watch` : 'All good'}
        </span>
      </div>
      {shown.length > 0 ? (
        shown.map((i) => (
          <div key={i.key} className="watch-item">
            <WatchRow item={i} open={openKey === i.key} onToggle={() => setOpenKey(openKey === i.key ? null : i.key)} />
            {openKey === i.key && (
              <WatchDetail item={i} logs={i.period === 'week' ? weekLogs : logs} scope={i.period === 'week' || isWeek ? 'over 7 days' : period} />
            )}
          </div>
        ))
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          Nothing near its limit {period}: saturated and trans fat, added sugar, mercury and more.
        </p>
      )}
      <button type="button" className="link" style={{ margin: '10px 0 0' }} onClick={() => setShowAll(!showAll)}>
        {showAll ? 'Show only items to watch' : `Show all ${items.length}`}
      </button>
    </section>
  )
}
