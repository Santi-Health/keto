import { useMemo } from 'react'
import { estimateA1c } from '../lib/a1c'
import { useData } from '../lib/data'

const BAND = {
  normal: { label: 'Normal range', cls: 'ok' },
  prediabetes: { label: 'Prediabetes range', cls: '' },
  diabetes: { label: 'Diabetes range', cls: 'warn' },
} as const

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** Estimated A1C from your CGM average (GMI), calibrated to your lab HbA1c when one overlaps the CGM data. */
export function A1cCard() {
  const { cgmDays, readings } = useData()
  const a = useMemo(() => estimateA1c(cgmDays, readings), [cgmDays, readings])
  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 6 }}>
        <h2>Estimated A1C</h2>
        {a.band && <span className={`badge ${BAND[a.band].cls}`}>{BAND[a.band].label}</span>}
      </div>
      {a.estimate == null ? (
        <p className="muted small" style={{ margin: 0 }}>
          Needs at least 3 full days of CGM data. Import your Lingo readings on this tab; a reliable estimate takes about 14 days.
        </p>
      ) : (
        <>
          <div className="a1c-big">
            <b>{a.estimate.toFixed(1)}%</b>
            <span>
              {a.confidence === 'early'
                ? `Early estimate from ${a.basedOnDays} full days of CGM. It firms up at 14 days.`
                : a.confidence === 'good'
                  ? `From ${a.basedOnDays} days of CGM.`
                  : `From ${a.basedOnDays} days of CGM: a solid estimate.`}
            </span>
          </div>
          <p className="small" style={{ margin: '8px 0 0' }}>
            Average glucose {a.quarter.meanGlucose} mg/dL → GMI {a.quarter.gmi?.toFixed(1)}%
            {a.recent.gmi != null && a.recent.daysWithData < a.quarter.daysWithData ? ` · last 14 days ${a.recent.gmi.toFixed(1)}%` : ''}
            {a.personalOffset != null
              ? ` · adjusted ${a.personalOffset > 0 ? '+' : ''}${a.personalOffset} to match your lab result`
              : ''}
            .
          </p>
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            Under 5.7% is normal, 5.7–6.4% prediabetes, 6.5% and above diabetes. Lab A1C reflects about 3 months (mostly the last 30 days),
            so the estimate moves slowly. CGM-based estimates can differ from a lab test by up to ±0.5 points
            {a.lab ? '' : '; log a lab HbA1c (Readings → Lab) and the app will calibrate to you'}.
          </p>
          {a.lab && (
            <p className="small" style={{ margin: '6px 0 0' }}>
              Last lab HbA1c: <b>{a.lab.value}%</b> ({fmt(a.lab.date)})
              {a.personalOffset == null && ' — no CGM data from the 3 months before it yet, so it can’t calibrate the estimate.'}
            </p>
          )}
        </>
      )}
    </section>
  )
}
