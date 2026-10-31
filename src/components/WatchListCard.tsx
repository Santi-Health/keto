import { useState } from 'react'
import type { WatchItem } from '../lib/watchlist'

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 1 : 0 })

function WatchRow({ item }: { item: WatchItem }) {
  const value = item.value == null ? '—' : fmt(item.value)
  const limit = item.limit == null ? '' : ` / ${fmt(item.limit)}`
  return (
    <div className="watch-row" title={item.guidance}>
      <span>
        <span className={`dot ${item.status}`} aria-hidden="true" />
        {item.label}
        {item.period === 'week' && <span className="muted"> (7 days)</span>}
      </span>
      <span className={item.status === 'over' ? '' : 'muted'} style={item.status === 'over' ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>
        {value}
        {limit} {item.unit}
      </span>
    </div>
  )
}

/** Quiet when everything is fine; lists anything near or over its limit. */
export function WatchListCard({ items, period = 'today' }: { items: WatchItem[]; period?: string }) {
  const [showAll, setShowAll] = useState(false)
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
        shown.map((i) => <WatchRow key={i.key} item={i} />)
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          Nothing near its limit {period}: saturated and trans fat, added sugar, mercury and more.
        </p>
      )}
      {showAll && flagged.length > 0 && (
        <p className="muted small">{flagged.map((i) => `${i.label}: ${i.guidance}`).join(' ')}</p>
      )}
      <button type="button" className="link" style={{ margin: '10px 0 0' }} onClick={() => setShowAll(!showAll)}>
        {showAll ? 'Show only items to watch' : `Show all ${items.length}`}
      </button>
    </section>
  )
}
