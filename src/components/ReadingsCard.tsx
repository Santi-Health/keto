import { useEffect, useMemo, useState } from 'react'
import { toReadings } from '../lib/cgm'
import { useData } from '../lib/data'
import { KG_PER_LB, URINE_LEVELS, gkiBand, gkiFor, hoursSinceFood, ketoneBand, latest, weightTrend, type ReadingKind } from '../lib/readings'
import { localDate } from '../lib/targets'
import { entryDay } from '../lib/time'
import type { WeightUnit } from '../lib/types'

interface Props {
  weightUnit: WeightUnit
  onAdd: (kind?: ReadingKind) => void
}

const when = (iso: string) => {
  const d = new Date(iso)
  const today = localDate()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const day = localDate(d)
  if (day === today) return `today ${time}`
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (day === localDate(y)) return `yesterday ${time}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Ticks once a minute so the fasting clock stays current. */
function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function ReadingsCard({ weightUnit, onAdd }: Props) {
  const { readings, logs, cgmDays } = useData()
  const now = useNow()
  const fastH = hoursSinceFood(logs, now)
  const ketone = latest(readings, 'blood_ketone')
  const glucose = latest(readings, 'glucose')
  const urine = latest(readings, 'urine_ketone')
  const weight = latest(readings, 'weight')
  const scan = latest(readings, 'body_scan')
  const ketoneDay = ketone ? entryDay(ketone.taken_at, ketone.meta.tz) : null
  const cgm = useMemo(() => (ketoneDay && cgmDays[ketoneDay] ? toReadings([cgmDays[ketoneDay]]) : []), [cgmDays, ketoneDay])
  const gki = ketone ? gkiFor(ketone, readings, cgm) : null
  const trend = weightTrend(readings)
  const toUnit = (kg: number) => (weightUnit === 'lb' ? kg / KG_PER_LB : kg)
  const labs = useMemo(() => {
    const byTest = new Map<string, (typeof readings)[number]>()
    for (const r of readings.filter((r) => r.kind === 'lab').sort((a, b) => b.taken_at.localeCompare(a.taken_at)))
      if (r.meta.test && !byTest.has(r.meta.test)) byTest.set(r.meta.test, r)
    return [...byTest.values()].slice(0, 4)
  }, [readings])

  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 6 }}>
        <h2>Readings</h2>
        <button type="button" className="btn secondary" onClick={() => onAdd()}>
          + Reading
        </button>
      </div>

      <div className="stat-grid two-col">
        <div>
          <b>{fastH == null ? '—' : `${Math.floor(fastH)}h ${String(Math.floor((fastH % 1) * 60)).padStart(2, '0')}m`}</b>
          <span>Since last food</span>
        </div>
        <button type="button" className="stat-btn" onClick={() => onAdd('blood_ketone')}>
          <b style={{ color: 'var(--ketone)' }}>{ketone?.value != null ? ketone.value.toFixed(1) : '—'}</b>
          <span>{ketone ? `Ketones mmol/L · ${when(ketone.taken_at)}` : 'Ketones: tap to add'}</span>
        </button>
        <button type="button" className="stat-btn" onClick={() => onAdd('glucose')}>
          <b>{glucose?.value != null ? Math.round(glucose.value) : '—'}</b>
          <span>{glucose ? `Finger-stick mg/dL · ${when(glucose.taken_at)}` : 'Finger-stick: tap to add'}</span>
        </button>
        <button type="button" className="stat-btn" onClick={() => onAdd('weight')}>
          <b>{weight?.value != null ? toUnit(weight.value).toFixed(1) : '—'}</b>
          <span>
            {weight ? `${weightUnit} · ${when(weight.taken_at)}` : 'Weight: tap to add'}
            {trend != null && ` · ${trend >= 0 ? '+' : '−'}${Math.abs(toUnit(trend)).toFixed(1)}/wk`}
          </span>
        </button>
      </div>

      {ketone?.value != null && (
        <p className="small" style={{ margin: '8px 0 0' }}>
          Last blood reading: <b>{ketoneBand(ketone.value)}</b>.
          {gki && (
            <>
              {' '}
              GKI <b>{gki.value}</b> ({gkiBand(gki.value)}, glucose from {gki.glucoseSource}).
            </>
          )}
        </p>
      )}
      {urine && (
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          Urine strip: {URINE_LEVELS.find((u) => u.value === urine.urine_level)?.label.toLowerCase()} ({when(urine.taken_at)})
        </p>
      )}
      {scan?.meta.scan && (
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          Last body scan: {scan.value}% body fat
          {scan.meta.scan.leanMassKg ? ` · ${(scan.meta.scan.leanMassKg / KG_PER_LB).toFixed(1)} lb lean` : ''} (
          {new Date(scan.taken_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}). Progress is on Insights.
        </p>
      )}
      {labs.length > 0 && (
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          Labs: {labs.map((l) => `${l.meta.test} ${l.value}${l.unit === '%' ? '%' : ` ${l.unit ?? ''}`} (${new Date(l.taken_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`).join(' · ')}
        </p>
      )}

    </section>
  )
}
