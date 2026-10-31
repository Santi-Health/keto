import { useState } from 'react'
import { microStatus, vitaminCoverage } from '../lib/micros'
import type { Nutrients } from '../lib/nutrients'
import type { Sex } from '../lib/types'

interface Props {
  /** The day's (or average day's) totals. */
  total: Nutrients
  /** Each item's nutrients, to tell how much of the day has vitamin data. */
  items: Nutrients[]
  sex: Sex
  age: number
  week: boolean
}

const fmt = (v: number, unit: string) => (v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? v.toFixed(0) : v.toFixed(1)) + ` ${unit}`

/** Vitamins and trace minerals against daily targets, lowest first. */
export function VitaminsCard({ total, items, sex, age, week }: Props) {
  const [all, setAll] = useState(false)
  const status = microStatus(total, sex, age)
  const coverage = vitaminCoverage(items)
  const shown = all ? status : status.slice(0, 6)
  if (!items.length) return null
  return (
    <section className="card">
      <h2>Vitamins &amp; minerals</h2>
      {coverage < 100 && (
        <p className="muted small" style={{ marginTop: 0 }}>
          {coverage}% of {week ? 'these days’' : 'today’s'} calories come from foods with vitamin data. The rest are being looked up and fill in on their own.
        </p>
      )}
      {shown.map((s) => (
        <div className="bar-row" key={s.micro.key} title={s.micro.why}>
          <div className="bar-head">
            <span>{s.micro.label}</span>
            <span className={s.over ? 'warn-text' : 'muted'}>
              {fmt(s.value, s.micro.unit)} / {fmt(s.target, s.micro.unit)}
              {s.over ? ' · over the upper limit' : ''}
            </span>
          </div>
          <div className="bar" role="progressbar" aria-valuenow={Math.round(s.pct)} aria-valuemax={100} aria-label={s.micro.label}>
            <span style={{ width: `${Math.min(100, s.pct)}%`, background: s.over ? 'var(--warn)' : s.pct >= 100 ? 'var(--accent)' : s.pct >= 50 ? '#d39b2a' : 'var(--warn)' }} />
          </div>
        </div>
      ))}
      <button type="button" className="link" onClick={() => setAll(!all)}>
        {all ? 'Show fewer' : `Show all ${status.length}`}
      </button>
    </section>
  )
}
