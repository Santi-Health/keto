import { useState } from 'react'
import { SCAN_PROMPT, parseScanJson, recompSummary, scanChanges, scansOf } from '../lib/bodyScan'
import { useData } from '../lib/data'
import { KG_PER_LB, type BodyScan, type ReadingRow } from '../lib/readings'
import { localDate } from '../lib/targets'
import { Sheet } from './Sheet'

type Field = { key: keyof BodyScan | `region.${'arms' | 'legs' | 'trunk' | 'android' | 'gynoid'}`; label: string; unit: string; lb?: boolean }

const FIELDS: Field[] = [
  { key: 'bodyFatPct', label: 'Body fat', unit: '%' },
  { key: 'totalMassKg', label: 'Total mass', unit: 'lb', lb: true },
  { key: 'fatMassKg', label: 'Fat mass', unit: 'lb', lb: true },
  { key: 'leanMassKg', label: 'Lean tissue', unit: 'lb', lb: true },
  { key: 'boneMassKg', label: 'Bone (BMC)', unit: 'lb', lb: true },
  { key: 'vatMassKg', label: 'Visceral fat (VAT)', unit: 'lb', lb: true },
  { key: 'restingMetabolicRate', label: 'Resting metabolic rate', unit: 'kcal' },
  { key: 'almi', label: 'ALMI', unit: 'kg/m²' },
  { key: 'agRatio', label: 'A/G ratio', unit: '' },
  { key: 'region.arms', label: 'Arms fat', unit: '%' },
  { key: 'region.legs', label: 'Legs fat', unit: '%' },
  { key: 'region.trunk', label: 'Trunk fat', unit: '%' },
  { key: 'region.android', label: 'Android (belly) fat', unit: '%' },
  { key: 'region.gynoid', label: 'Gynoid (hips) fat', unit: '%' },
]

const getField = (s: BodyScan, f: Field): number | undefined => {
  const v = f.key.startsWith('region.') ? s.regions?.[f.key.slice(7) as 'arms'] : (s[f.key as keyof BodyScan] as number | undefined)
  if (v == null || !f.lb) return v
  // Small masses like visceral fat (~0.5 lb) keep two decimals.
  const lb = v / KG_PER_LB
  return lb < 5 ? Math.round(lb * 100) / 100 : Math.round(lb * 10) / 10
}

/** Adds or edits a DEXA scan: paste Claude's reading of the PDF, or type the numbers. */
export function BodyScanSheet({ reading, onClose }: { reading?: ReadingRow; onClose: () => void }) {
  const { saveReading, deleteReading } = useData()
  const [date, setDate] = useState(reading ? localDate(new Date(reading.taken_at)) : localDate())
  const [provider, setProvider] = useState(reading?.meta.scan?.provider ?? 'BodySpec')
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    const s = reading?.meta.scan
    if (s) for (const f of FIELDS) {
      const x = getField(s, f)
      if (x != null) v[f.key] = String(x)
    }
    return v
  })
  const [paste, setPaste] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function fromClaude() {
    setError(null)
    try {
      const { date: d, scan } = parseScanJson(paste)
      if (d) setDate(d)
      if (scan.provider) setProvider(scan.provider)
      const v: Record<string, string> = {}
      for (const f of FIELDS) {
        const x = getField(scan, f)
        if (x != null) v[f.key] = String(x)
      }
      setValues(v)
      setPaste('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function save() {
    const n = (k: string) => (values[k] && Number(values[k]) > 0 ? Number(values[k]) : undefined)
    const kg = (k: string) => (n(k) == null ? undefined : Math.round(n(k)! * KG_PER_LB * 1000) / 1000)
    const scan: BodyScan = { provider, regions: {} }
    for (const f of FIELDS) {
      const v = f.lb ? kg(f.key) : n(f.key)
      if (v == null) continue
      if (f.key.startsWith('region.')) scan.regions![f.key.slice(7) as 'arms'] = v
      else (scan as Record<string, unknown>)[f.key] = v
    }
    if (scan.bodyFatPct == null) return setError('Body fat % is needed.')
    saveReading({
      id: reading?.id ?? crypto.randomUUID(),
      taken_at: new Date(`${date}T12:00:00`).toISOString(),
      kind: 'body_scan',
      value: scan.bodyFatPct,
      urine_level: null,
      context: 'other',
      note: null,
      predicted_value: null,
      unit: '%',
      meta: { scan },
      updated_at: new Date().toISOString(),
      deleted_at: null,
    })
    onClose()
  }

  return (
    <Sheet title={reading ? 'Edit body scan' : 'Add body scan'} subtitle="DEXA results (BodySpec or similar)" onClose={onClose}>
      {!reading && (
        <details className="small" open={!Object.keys(values).length} style={{ marginBottom: 12 }}>
          <summary>Fill it in from your PDF with Claude</summary>
          <ol className="steps">
            <li>
              <button
                type="button"
                className="btn secondary small-btn"
                onClick={() =>
                  void navigator.clipboard.writeText(SCAN_PROMPT).then(
                    () => setCopied(true),
                    () => setError("Couldn't copy. Open “Show the prompt” and copy it by hand."),
                  )
                }
              >
                {copied ? 'Prompt copied ✓' : 'Copy prompt'}
              </button>
            </li>
            <li>
              Paste it in{' '}
              <a href="https://claude.ai/new" target="_blank" rel="noreferrer">
                Claude
              </a>{' '}
              and attach your BodySpec PDF or screenshots.
            </li>
            <li>Paste the reply here:</li>
          </ol>
          <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='{ "date": … }' aria-label="Claude's reply" />
          <button type="button" className="btn small-btn" style={{ marginTop: 8 }} disabled={!paste.trim()} onClick={fromClaude}>
            Fill in the numbers
          </button>
        </details>
      )}

      <div className="row">
        <div className="field">
          <label htmlFor="bs-date">Scan date</label>
          <input id="bs-date" type="date" value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="bs-prov">Provider</label>
          <input id="bs-prov" type="text" value={provider} onChange={(e) => setProvider(e.target.value)} />
        </div>
      </div>
      <div className="form-grid">
        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`bs-${f.key}`}>
              {f.label} {f.unit && <span className="muted">({f.unit})</span>}
            </label>
            <input
              id={`bs-${f.key}`}
              type="number"
              inputMode="decimal"
              step="any"
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      {error && (
        <p className="notice small" role="alert">
          {error}
        </p>
      )}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={save}>
          {reading ? 'Save changes' : 'Save scan'}
        </button>
        {reading && (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              deleteReading(reading.id)
              onClose()
            }}
          >
            Delete
          </button>
        )}
      </div>
    </Sheet>
  )
}

const fmtDelta = (d: number | null, unit: string, lowerIsBetter: boolean) => {
  if (d == null) return <span className="muted">—</span>
  if (d === 0) return <span className="muted">0</span>
  const good = lowerIsBetter ? d < 0 : d > 0
  return (
    <span style={{ color: good ? 'var(--accent)' : 'var(--warn)' }}>
      {d > 0 ? '+' : '−'}
      {Math.abs(d)}
      {unit === '%' ? ' pts' : ` ${unit}`}
    </span>
  )
}

/** Change in fat and lean mass since the first scan (lb), so small trends are visible. */
function ScanChart({ scans, dates }: { scans: BodyScan[]; dates: string[] }) {
  const W = 320
  const H = 130
  const pad = { l: 30, r: 8, t: 10, b: 18 }
  const delta = (get: (s: BodyScan) => number | undefined) => {
    const base = get(scans[0])
    return scans.map((s) => (base == null || get(s) == null ? null : (get(s)! - base) / KG_PER_LB))
  }
  const fat = delta((s) => s.fatMassKg)
  const lean = delta((s) => s.leanMassKg)
  const span = Math.max(2, ...[...fat, ...lean].map((v) => Math.abs(v ?? 0))) * 1.2
  const x = (i: number) => pad.l + (scans.length < 2 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (scans.length - 1))
  const y = (v: number) => pad.t + (1 - (v + span) / (2 * span)) * (H - pad.t - pad.b)
  const line = (vs: (number | null)[]) => vs.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(' ')
  const tick = Math.round(span / 1.2)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="keto-chart" role="img" aria-label="Change in fat and lean mass since the first scan">
      {[-tick, 0, tick].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis-zero' : 'grid-line'} />
          <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" className="axis-text">
            {t > 0 ? `+${t}` : t}
          </text>
        </g>
      ))}
      <polyline points={line(lean)} fill="none" stroke="var(--protein)" strokeWidth={2} />
      <polyline points={line(fat)} fill="none" stroke="var(--fat)" strokeWidth={2} />
      {scans.map((_, i) => (
        <g key={i}>
          {lean[i] != null && <circle cx={x(i)} cy={y(lean[i]!)} r={3.5} fill="var(--protein)" />}
          {fat[i] != null && <circle cx={x(i)} cy={y(fat[i]!)} r={3.5} fill="var(--fat)" />}
        </g>
      ))}
      <text x={pad.l} y={H - 4} className="axis-text">
        {dates[0]}
      </text>
      {dates.length > 1 && (
        <text x={W - pad.r} y={H - 4} textAnchor="end" className="axis-text">
          {dates[dates.length - 1]}
        </text>
      )}
    </svg>
  )
}

/** Progress across DEXA scans: latest numbers, change since the previous and the first scan, and the trend. */
export function BodyScanCard() {
  const { readings } = useData()
  const [sheet, setSheet] = useState<{ reading?: ReadingRow } | null>(null)
  const rows = scansOf(readings)
  const scans = rows.map((r) => r.meta.scan!)
  const changes = scanChanges(scans)
  const summary = recompSummary(scans)
  const dates = rows.map((r) => new Date(r.taken_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))

  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 6 }}>
        <h2>Body composition</h2>
        <button type="button" className="btn secondary small-btn" onClick={() => setSheet({})}>
          + Add scan
        </button>
      </div>
      {!rows.length ? (
        <p className="muted small" style={{ margin: 0 }}>
          Add your BodySpec (DEXA) scans to track fat, lean mass and visceral fat over time. Each new scan is compared with the last one and
          your first.
        </p>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            {rows.length} scan{rows.length > 1 ? 's' : ''} · latest {dates[dates.length - 1]}
          </p>
          <table className="scan-table">
            <thead>
              <tr>
                <th />
                <th>Latest</th>
                <th>vs. previous</th>
                {scans.length > 2 && <th>vs. first</th>}
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td>
                    <b>{c.latest}</b> {c.unit}
                  </td>
                  <td>{fmtDelta(c.sincePrevious, c.unit, c.lowerIsBetter)}</td>
                  {scans.length > 2 && <td>{fmtDelta(c.sinceFirst, c.unit, c.lowerIsBetter)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {summary && <p className="small">{summary}</p>}
          {scans.length > 1 && (
            <>
              <ScanChart scans={scans} dates={dates} />
              <p className="muted small" style={{ margin: '2px 0 0' }}>
                Change since your first scan (lb): <span style={{ color: 'var(--protein)' }}>●</span> lean mass ·{' '}
                <span style={{ color: 'var(--fat)' }}>●</span> fat mass
              </p>
            </>
          )}
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {rows.map((r, i) => (
              <button key={r.id} type="button" className="chip-btn" onClick={() => setSheet({ reading: r })}>
                {dates[i]}
              </button>
            ))}
          </div>
        </>
      )}
      {sheet && <BodyScanSheet reading={sheet.reading} onClose={() => setSheet(null)} />}
    </section>
  )
}
