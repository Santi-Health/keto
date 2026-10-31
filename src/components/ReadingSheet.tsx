import { useMemo, useState } from 'react'
import { toReadings } from '../lib/cgm'
import { useData } from '../lib/data'
import { estimateKetosis } from '../lib/ketosis'
import { useKetoModel } from '../lib/useKetoModel'
import {
  CONTEXTS,
  KG_PER_LB,
  LAB_TESTS,
  READING_KINDS,
  URINE_LEVELS,
  glucoseFlag,
  gkiBand,
  gkiFor,
  guessContext,
  ketoneBand,
  type ReadingContext,
  type ReadingKind,
  type ReadingRow,
  type UrineLevel,
} from '../lib/readings'
import { localDate } from '../lib/targets'
import type { WeightUnit } from '../lib/types'
import { Sheet } from './Sheet'

interface Props {
  weightUnit: WeightUnit
  netCarbLimit: number
  proteinTarget: number
  /** Existing reading to edit; omit to add a new one. */
  reading?: ReadingRow
  kind?: ReadingKind
  /** Day to log on (YYYY-MM-DD); defaults to now. */
  date?: string
  onClose: () => void
}

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

function defaultTime(date?: string): Date {
  const now = new Date()
  if (!date) return now
  const d = new Date(`${date}T08:00:00`)
  return d.toDateString() === now.toDateString() ? now : d
}

const showValue = (r: ReadingRow | undefined, unit: WeightUnit) => {
  if (r?.value == null) return ''
  if (r.kind === 'weight') return String(Math.round((unit === 'lb' ? r.value / KG_PER_LB : r.value) * 10) / 10)
  return String(r.value)
}

export function ReadingSheet({ weightUnit, netCarbLimit, proteinTarget, reading, kind: initialKind, date, onClose }: Props) {
  const { saveReading, deleteReading, readings, logs, exercises, cgmDays } = useData()
  const ketoModel = useKetoModel(netCarbLimit, proteinTarget)
  const [kind, setKind] = useState<ReadingKind>(reading?.kind ?? initialKind ?? 'blood_ketone')
  const [time, setTime] = useState(toLocalInput(reading ? new Date(reading.taken_at) : defaultTime(date)))
  const takenAt = new Date(time)
  const [context, setContext] = useState<ReadingContext>(reading?.context ?? guessContext(defaultTime(date), logs))
  const [valueText, setValueText] = useState(showValue(reading, weightUnit))
  const [urine, setUrine] = useState<UrineLevel>(reading?.urine_level ?? 'negative')
  const [bodyFat, setBodyFat] = useState(reading?.meta.bodyFatPct != null ? String(reading.meta.bodyFatPct) : '')
  const [test, setTest] = useState(reading?.meta.test ?? 'HbA1c')
  const [labUnit, setLabUnit] = useState(reading?.unit ?? '%')
  const [note, setNote] = useState(reading?.note ?? '')

  const value = valueText === '' ? null : Number(valueText)
  const valid = !Number.isNaN(takenAt.getTime()) && (kind === 'urine_ketone' || (value != null && Number.isFinite(value) && value >= 0 && (kind !== 'lab' || test.trim() !== '')))

  function build(): ReadingRow {
    let stored = value
    if (kind === 'weight' && value != null && weightUnit === 'lb') stored = Math.round(value * KG_PER_LB * 1000) / 1000
    const base: ReadingRow = {
      id: reading?.id ?? crypto.randomUUID(),
      taken_at: takenAt.toISOString(),
      kind,
      value: kind === 'urine_ketone' ? null : stored,
      urine_level: kind === 'urine_ketone' ? urine : null,
      context: kind === 'weight' || kind === 'lab' ? 'other' : context,
      note: note.trim() || null,
      predicted_value: kind === 'blood_ketone' ? (reading?.predicted_value ?? null) : null,
      unit: kind === 'blood_ketone' ? 'mmol/L' : kind === 'glucose' ? 'mg/dL' : kind === 'weight' ? 'kg' : kind === 'lab' ? labUnit.trim() || null : null,
      meta: {
        ...(reading?.kind === kind ? reading.meta : {}),
        ...(kind === 'weight' ? { bodyFatPct: bodyFat !== '' ? Number(bodyFat) : null } : {}),
        ...(kind === 'lab' ? { test: test.trim() } : {}),
      },
      updated_at: new Date().toISOString(),
      deleted_at: null,
    }
    // Remember what the estimate said, so readings can personalize it later.
    if (kind === 'blood_ketone' && base.predicted_value == null) {
      // What the app would have shown at that moment, personal model included.
      const e = estimateKetosis({ at: takenAt.getTime(), logs, exercises, netCarbLimit, proteinTarget, model: ketoModel.adjuster })
      base.predicted_value = e.mid
      base.meta.predictedLow = e.low
      base.meta.predictedHigh = e.high
    }
    return base
  }

  function save() {
    if (!valid) return
    saveReading(build())
    onClose()
  }

  // Live feedback while typing.
  const day = Number.isNaN(takenAt.getTime()) ? localDate() : localDate(takenAt)
  const cgm = useMemo(() => (cgmDays[day] ? toReadings([cgmDays[day]]) : []), [cgmDays, day])
  const draft = valid && value != null ? build() : null
  const gki = draft?.kind === 'blood_ketone' ? gkiFor(draft, readings, cgm) : null
  const flag = draft?.kind === 'glucose' ? glucoseFlag(draft) : null

  return (
    <Sheet title={reading ? 'Edit reading' : 'Add reading'} onClose={onClose}>
      <div className="field">
        <span className="label">What</span>
        <div className="chips">
          {READING_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              className={`chip-btn ${kind === k.value ? 'on' : ''}`}
              aria-pressed={kind === k.value}
              onClick={() => {
                if (k.value !== kind) setValueText('')
                setKind(k.value)
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {kind === 'urine_ketone' ? (
        <div className="field">
          <span className="label">Strip color</span>
          <div className="chips">
            {URINE_LEVELS.map((u) => (
              <button key={u.value} type="button" className={`chip-btn urine-${u.value} ${urine === u.value ? 'on' : ''}`} aria-pressed={urine === u.value} onClick={() => setUrine(u.value)}>
                {u.label}
              </button>
            ))}
          </div>
          <div className="hint">Urine strips show ketones you didn't use, so they fade as your body adapts. Blood readings are the reliable signal.</div>
        </div>
      ) : (
        <>
          {kind === 'lab' && (
            <div className="field">
              <label htmlFor="rd-test">Test</label>
              <input
                id="rd-test"
                type="text"
                list="rd-tests"
                value={test}
                onChange={(e) => {
                  setTest(e.target.value)
                  const known = LAB_TESTS.find((l) => l.test.toLowerCase() === e.target.value.toLowerCase())
                  if (known) setLabUnit(known.unit)
                }}
              />
              <datalist id="rd-tests">
                {LAB_TESTS.map((l) => (
                  <option key={l.test} value={l.test} />
                ))}
              </datalist>
            </div>
          )}
          <div className="row">
            <div className="field">
              <label htmlFor="rd-value">
                {kind === 'blood_ketone' ? 'Blood ketones (BHB)' : kind === 'glucose' ? 'Glucose (finger-stick)' : kind === 'weight' ? 'Weight' : 'Result'}
              </label>
              <div className="row">
                <input
                  id="rd-value"
                  type="number"
                  inputMode="decimal"
                  step={kind === 'blood_ketone' ? 0.1 : kind === 'weight' ? 0.1 : 1}
                  value={valueText}
                  autoFocus={!reading}
                  onChange={(e) => setValueText(e.target.value)}
                />
                {kind !== 'lab' && (
                  <span className="muted small" style={{ flex: 'none' }}>
                    {kind === 'blood_ketone' ? 'mmol/L' : kind === 'glucose' ? 'mg/dL' : weightUnit}
                  </span>
                )}
              </div>
            </div>
            {kind === 'weight' && (
              <div className="field">
                <label htmlFor="rd-bf">Body fat (optional)</label>
                <div className="row">
                  <input id="rd-bf" type="number" inputMode="decimal" step={0.1} value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} />
                  <span className="muted small" style={{ flex: 'none' }}>%</span>
                </div>
              </div>
            )}
            {kind === 'lab' && (
              <div className="field" style={{ flex: 0.7 }}>
                <label htmlFor="rd-unit">Unit</label>
                <input id="rd-unit" type="text" value={labUnit} onChange={(e) => setLabUnit(e.target.value)} />
              </div>
            )}
          </div>
        </>
      )}

      {draft?.kind === 'blood_ketone' && draft.value != null && (
        <p className="small" style={{ marginTop: 0 }}>
          {draft.value.toFixed(1)} mmol/L: <b>{ketoneBand(draft.value)}</b>
          {draft.meta.predictedLow != null && ` · the estimate said ${draft.meta.predictedLow}–${draft.meta.predictedHigh}`}
          {gki && (
            <>
              <br />
              GKI <b>{gki.value}</b> ({gkiBand(gki.value)}), using {gki.glucose} mg/dL from your {gki.glucoseSource}.
            </>
          )}
        </p>
      )}
      {flag && (
        <p className="notice small" role="status">
          {flag}
        </p>
      )}

      <div className="row">
        <div className="field" style={{ flex: 1.4 }}>
          <label htmlFor="rd-time">{kind === 'lab' ? 'Test date' : 'Time'}</label>
          <input id="rd-time" type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        {(kind === 'blood_ketone' || kind === 'glucose' || kind === 'urine_ketone') && (
          <div className="field">
            <label htmlFor="rd-ctx">When</label>
            <select id="rd-ctx" value={context} onChange={(e) => setContext(e.target.value as ReadingContext)}>
              {CONTEXTS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="rd-note">Note (optional)</label>
        <input id="rd-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. after StairMaster, felt foggy" />
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={save} disabled={!valid}>
          {reading ? 'Save changes' : 'Save reading'}
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
