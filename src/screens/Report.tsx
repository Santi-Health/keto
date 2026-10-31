import { useMemo } from 'react'
import { scanChanges, scansOf } from '../lib/bodyScan'
import { formatSleep } from '../lib/activity'
import { useData } from '../lib/data'
import { sessionLabel } from '../lib/exercise'
import { KG_PER_LB } from '../lib/readings'
import { ageOn, localDate, type Targets } from '../lib/targets'
import { RANGES, dailySeries, lastDays, summarizeRange, type RangeDays } from '../lib/trends'
import type { Profile } from '../lib/types'
import { TrendChart } from '../components/TrendChart'

interface Props {
  profile: Profile
  targets: Targets
  days: RangeDays
  onRange: (days: RangeDays) => void
  onBack: () => void
}

const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const v = (x: number | null | undefined, unit = '', digits = 0) => (x == null ? '—' : `${x.toFixed(digits)}${unit}`)

/** One-page summary for a doctor visit: print it or save it as a PDF from the browser. */
export function Report({ profile, targets, days, onRange, onBack }: Props) {
  const { logs, readings, exercises, activity, cgmDays } = useData()
  const range = useMemo(() => lastDays(days), [days])
  const pts = useMemo(() => dailySeries({ days: range, logs, readings, exercises, activity, cgmDays }), [range, logs, readings, exercises, activity, cgmDays])
  const s = useMemo(() => summarizeRange(pts, readings, targets.netCarbsG), [pts, readings, targets.netCarbsG])
  const lb = (kg: number | null) => (kg == null ? null : kg / KG_PER_LB)
  const from = range[0]
  const to = range[range.length - 1]
  const inRange = (iso: string) => {
    const d = localDate(new Date(iso))
    return d >= from && d <= to
  }

  const labs = readings
    .filter((r) => r.kind === 'lab' && r.meta.test)
    .sort((a, b) => b.taken_at.localeCompare(a.taken_at))
    .filter((r, i, all) => all.findIndex((x) => x.meta.test === r.meta.test) === i)
  const scanRows = scansOf(readings)
  const scans = scanRows.map((r) => r.meta.scan!)
  const changes = scanChanges(scans)
  const fingerSticks = readings.filter((r) => r.kind === 'glucose' && r.value != null && inRange(r.taken_at))
  const highs = fingerSticks.filter((r) => (r.context === 'fasted' ? (r.value ?? 0) >= 126 : (r.value ?? 0) > 180)).length
  const lows = fingerSticks.filter((r) => (r.value ?? 0) < 70).length
  const sessions = exercises.filter((e) => inRange(e.started_at))
  const kinds = [...new Set(sessions.map(sessionLabel))]

  return (
    <div className="report">
      <div className="report-actions no-print">
        <button type="button" className="btn secondary" onClick={onBack}>
          ‹ Back
        </button>
        <div className="segmented" role="group" aria-label="Range" style={{ flex: 1 }}>
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={days === r} onClick={() => onRange(r)}>
              {r} days
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>

      <header className="report-head">
        <h1>Nutrition &amp; metabolic summary</h1>
        <p>
          {profile.reportName ? <b>{profile.reportName}</b> : null}
          {profile.reportName ? ' · ' : ''}
          {profile.sex === 'male' ? 'Male' : profile.sex === 'female' ? 'Female' : ''}, age {ageOn(profile.birthDate, new Date())}
          {profile.heightCm ? ` · ${Math.round(profile.heightCm)} cm` : ''} · prediabetes · ketogenic diet (net carbs ≤ {targets.netCarbsG} g/day)
        </p>
        <p className="muted">
          {fmtDate(from)} – {fmtDate(to)} ({days} days) · generated {fmtDate(localDate())} from the patient's own tracking app
        </p>
      </header>

      <section className="report-grid">
        <div>
          <h2>Glucose</h2>
          <table className="report-table">
            <tbody>
              <tr><td>CGM average</td><td>{v(s.glucoseAvg, ' mg/dL')}</td></tr>
              <tr><td>CGM 3–6 AM average</td><td>{v(s.glucoseOvernight, ' mg/dL')}</td></tr>
              <tr><td>CGM time in 70–140</td><td>{v(s.glucoseInRangePct, '%')}</td></tr>
              <tr><td>Finger-stick fasting avg</td><td>{v(s.fastingGlucose, ' mg/dL')}</td></tr>
              <tr><td>Finger-sticks: high / low</td><td>{fingerSticks.length ? `${highs} / ${lows} of ${fingerSticks.length}` : '—'}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h2>Ketones</h2>
          <table className="report-table">
            <tbody>
              <tr><td>Blood BHB readings</td><td>{s.ketoneReadings}</td></tr>
              <tr><td>Average BHB</td><td>{v(s.ketones, ' mmol/L', 1)}</td></tr>
              <tr><td>Days ≥ 0.5 mmol/L</td><td>{s.ketoneReadings ? s.daysInKetosis : '—'}</td></tr>
              <tr><td>Average GKI</td><td>{v(s.gki, '', 1)}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h2>Diet (average of {s.loggedDays} logged days)</h2>
          <table className="report-table">
            <tbody>
              <tr><td>Calories</td><td>{v(s.kcal, ' kcal')}{s.burn != null ? ` (burn ${Math.round(s.burn)})` : ''}</td></tr>
              <tr><td>Net carbs</td><td>{v(s.netCarbs, ' g', 1)} · {s.daysUnderCarbLimit}/{s.loggedDays} days ≤ {targets.netCarbsG} g</td></tr>
              <tr><td>Protein / fat</td><td>{v(s.protein, ' g')} / {v(s.fat, ' g')}</td></tr>
              <tr><td>Fiber</td><td>{v(s.fiber, ' g', 1)}</td></tr>
              <tr><td>Sodium / potassium / magnesium</td><td>{v(s.sodiumMg)} / {v(s.potassiumMg)} / {v(s.magnesiumMg)} mg</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h2>Body &amp; activity</h2>
          <table className="report-table">
            <tbody>
              <tr><td>Weight</td><td>{s.weightStartKg != null ? `${v(lb(s.weightStartKg), ' lb', 1)} → ${v(lb(s.weightEndKg), ' lb', 1)}` : '—'}</td></tr>
              <tr><td>Exercise</td><td>{s.exerciseMinPerWeek} min/week{kinds.length ? ` (${kinds.slice(0, 4).join(', ')})` : ''}</td></tr>
              <tr><td>Steps</td><td>{s.steps != null ? `${Math.round(s.steps).toLocaleString()}/day` : '—'}</td></tr>
              <tr><td>Sleep</td><td>{s.sleepMin != null ? formatSleep(s.sleepMin) : '—'}</td></tr>
              <tr><td>Resting heart rate</td><td>{v(s.restingHr, ' bpm')}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-charts">
        <TrendChart
          title="Glucose, CGM (mg/dL)"
          days={range}
          series={[
            { label: 'daily average', color: '#b8932a', type: 'line', values: pts.map((p) => p.glucoseAvg) },
            { label: '3–6 AM', color: '#3a6fd8', type: 'line', values: pts.map((p) => p.glucoseOvernight) },
          ]}
          refs={[{ value: 100, label: '100' }]}
        />
        <TrendChart
          title="Blood ketones (mmol/L)"
          days={range}
          min={0}
          series={[{ label: 'BHB', color: '#7c4dcc', type: 'dots', values: pts.map((p) => p.ketones) }]}
          refs={[{ value: 0.5, label: '0.5' }]}
        />
        <TrendChart
          title="Net carbs (g/day)"
          days={range}
          series={[{ label: 'net carbs', color: '#c96f2b', type: 'bar', values: pts.map((p) => (p.logged ? p.netCarbs : null)) }]}
          refs={[{ value: targets.netCarbsG, label: `${targets.netCarbsG} g` }]}
        />
        <TrendChart
          title="Weight (lb)"
          days={range}
          series={[{ label: 'weight', color: '#2f7d5b', type: 'line', values: pts.map((p) => (p.weightKg == null ? null : Math.round(lb(p.weightKg)! * 10) / 10)) }]}
        />
      </section>

      {scans.length > 0 && (
        <section>
          <h2>Body composition (DEXA)</h2>
          <table className="report-table wide">
            <thead>
              <tr>
                <th>Date</th>
                <th>Body fat</th>
                <th>Fat (lb)</th>
                <th>Lean (lb)</th>
                <th>Visceral (lb)</th>
                <th>RMR</th>
              </tr>
            </thead>
            <tbody>
              {scanRows.slice(-5).map((r) => {
                const sc = r.meta.scan!
                return (
                  <tr key={r.id}>
                    <td>{fmtDate(localDate(new Date(r.taken_at)))}</td>
                    <td>{v(sc.bodyFatPct, '%', 1)}</td>
                    <td>{v(lb(sc.fatMassKg ?? null), '', 1)}</td>
                    <td>{v(lb(sc.leanMassKg ?? null), '', 1)}</td>
                    <td>{v(lb(sc.vatMassKg ?? null), '', 2)}</td>
                    <td>{v(sc.restingMetabolicRate)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {changes.length > 0 && scans.length > 1 && (
            <p className="small">
              Since first scan:{' '}
              {changes
                .filter((c) => c.sinceFirst != null || c.sincePrevious != null)
                .slice(0, 3)
                .map((c) => `${c.label.toLowerCase()} ${(c.sinceFirst ?? c.sincePrevious)! > 0 ? '+' : ''}${c.sinceFirst ?? c.sincePrevious}${c.unit === '%' ? ' pts' : ` ${c.unit}`}`)
                .join(', ')}
              .
            </p>
          )}
        </section>
      )}

      {labs.length > 0 && (
        <section>
          <h2>Latest labs</h2>
          <table className="report-table wide">
            <tbody>
              {labs.map((l) => (
                <tr key={l.id}>
                  <td>{l.meta.test}</td>
                  <td>
                    {l.value} {l.unit}
                  </td>
                  <td>{fmtDate(localDate(new Date(l.taken_at)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="report-foot">
        Self-tracked data: food logged by the patient (USDA / label values), glucose from a Lingo CGM and finger-sticks, ketones from a blood meter,
        activity and sleep from Fitbit, body composition from BodySpec DEXA. Intake averages include only days with food logged. Not a medical record.
      </p>
    </div>
  )
}
