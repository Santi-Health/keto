import { useState } from 'react'
import { watchArea, type AreaView } from '../lib/areas'
import type { WatchItem } from '../lib/watchlist'
import { AreaDetail } from './AreaDetail'

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 1 : 0 })

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
  view: AreaView
  period?: string
}

/** Quiet when everything is fine; lists anything near or over its limit. Tap an item to see the foods behind it and what to change. */
export function WatchListCard({ items, view, period = 'today' }: Props) {
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
            {openKey === i.key && <AreaDetail area={watchArea(i)} view={view} />}
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
