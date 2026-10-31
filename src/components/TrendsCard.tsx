import { useMemo, useState } from 'react'
import { formatSleep } from '../lib/activity'
import { useData } from '../lib/data'
import { KG_PER_LB } from '../lib/readings'
import { RANGES, dailySeries, lastDays, summarizeRange, type RangeDays } from '../lib/trends'
import type { Targets } from '../lib/targets'
import type { WeightUnit } from '../lib/types'
import { Segmented } from './Fields'
import { TrendChart } from './TrendChart'

interface Props {
  targets: Targets
  weightUnit: WeightUnit
  onOpenReport: (days: RangeDays) => void
}

/** 7/30/90-day trends: weight, intake vs. burn, carbs, protein, ketones, glucose, sleep and heart rate. */
export function TrendsCard({ targets, weightUnit, onOpenReport }: Props) {
  const { logs, readings, exercises, activity, cgmDays } = useData()
  const [range, setRange] = useState<RangeDays>(30)
  const days = useMemo(() => lastDays(range), [range])
  const pts = useMemo(() => dailySeries({ days, logs, readings, exercises, activity, cgmDays }), [days, logs, readings, exercises, activity, cgmDays])
  const sum = useMemo(() => summarizeRange(pts, readings, targets.netCarbsG), [pts, readings, targets.netCarbsG])
  const w = (kg: number | null) => (kg == null ? null : Math.round((weightUnit === 'lb' ? kg / KG_PER_LB : kg) * 10) / 10)
  // Intake on unlogged days would read as zero; show those as gaps instead.
  const intake = (get: (p: (typeof pts)[number]) => number) => pts.map((p) => (p.logged ? get(p) : null))
  const weightChange = sum.weightStartKg != null && sum.weightEndKg != null ? w(sum.weightEndKg)! - w(sum.weightStartKg)! : null

  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 6 }}>
        <h2>Trends</h2>
        <button type="button" className="btn secondary small-btn" onClick={() => onOpenReport(range)}>
          Doctor summary
        </button>
      </div>
      <Segmented label="Range" value={String(range) as `${RangeDays}`} options={RANGES.map((r) => ({ value: String(r) as `${RangeDays}`, label: `${r} days` }))} onChange={(v) => setRange(Number(v) as RangeDays)} />

      <div className="stat-grid two-col" style={{ marginBottom: 10 }}>
        <div>
          <b>{sum.kcal != null ? Math.round(sum.kcal).toLocaleString() : '—'}</b>
          <span>Avg kcal eaten ({sum.loggedDays} logged days)</span>
        </div>
        <div>
          <b>{sum.netCarbs ?? '—'} g</b>
          <span>
            Avg net carbs · {sum.daysUnderCarbLimit}/{sum.loggedDays} days ≤ {targets.netCarbsG} g
          </span>
        </div>
        <div>
          <b>{sum.protein != null ? Math.round(sum.protein) : '—'} g</b>
          <span>Avg protein (target {targets.proteinG} g)</span>
        </div>
        <div>
          <b>{weightChange == null ? '—' : `${weightChange > 0 ? '+' : weightChange < 0 ? '−' : ''}${Math.abs(Math.round(weightChange * 10) / 10)}`}</b>
          <span>{weightUnit} weight change</span>
        </div>
      </div>

      <TrendChart
        title={`Weight (${weightUnit})`}
        days={days}
        series={[{ label: 'weigh-ins', color: 'var(--accent)', type: 'line', values: pts.map((p) => w(p.weightKg)) }]}
      />
      <TrendChart
        title="Calories eaten vs. burned"
        days={days}
        series={[
          { label: 'eaten', color: 'var(--calories)', type: 'bar', values: intake((p) => p.kcal) },
          { label: 'burned (Fitbit)', color: 'var(--text-2)', type: 'line', values: pts.map((p) => p.burn) },
        ]}
        refs={targets.calories != null ? [{ value: targets.calories, label: `target ${targets.calories.toLocaleString()}` }] : []}
      />
      <TrendChart
        title="Net carbs (g)"
        days={days}
        series={[{ label: 'net carbs', color: 'var(--carbs)', type: 'bar', values: intake((p) => p.netCarbs) }]}
        refs={[{ value: targets.netCarbsG, label: `limit ${targets.netCarbsG} g`, color: 'var(--warn)' }]}
      />
      <TrendChart
        title="Protein (g)"
        days={days}
        series={[{ label: 'protein', color: 'var(--protein)', type: 'bar', values: intake((p) => p.protein) }]}
        refs={[{ value: targets.proteinG, label: `target ${targets.proteinG} g` }]}
      />
      <TrendChart
        title="Blood ketones (mmol/L)"
        days={days}
        min={0}
        series={[
          { label: 'measured', color: 'var(--ketone)', type: 'dots', values: pts.map((p) => p.ketones) },
          { label: 'estimate at the time', color: 'var(--text-2)', type: 'line', values: pts.map((p) => p.ketonesPredicted) },
        ]}
        refs={[{ value: 0.5, label: 'ketosis 0.5', color: 'var(--ketone)' }]}
      />
      <TrendChart
        title="Glucose, CGM (mg/dL)"
        days={days}
        series={[
          { label: 'daily average', color: 'var(--fat)', type: 'line', values: pts.map((p) => p.glucoseAvg) },
          { label: '3–6 AM', color: 'var(--protein)', type: 'line', values: pts.map((p) => p.glucoseOvernight) },
          { label: 'finger-stick fasted', color: 'var(--warn)', type: 'dots', values: pts.map((p) => p.fastingGlucose) },
        ]}
        refs={[{ value: 100, label: '100 fasting' }]}
      />
      <TrendChart
        title="Sleep (hours)"
        days={days}
        series={[{ label: 'asleep', color: 'var(--ketone)', type: 'bar', values: pts.map((p) => (p.sleepMin == null ? null : Math.round((p.sleepMin / 60) * 10) / 10)) }]}
        refs={[{ value: 7, label: '7 h' }]}
      />
      <TrendChart
        title="Resting heart rate (bpm)"
        days={days}
        series={[{ label: 'resting HR', color: 'var(--warn)', type: 'line', values: pts.map((p) => p.restingHr) }]}
      />
      <p className="muted small" style={{ marginBottom: 0 }}>
        Averages: {sum.steps != null ? `${Math.round(sum.steps).toLocaleString()} steps/day · ` : ''}
        {sum.sleepMin != null ? `${formatSleep(sum.sleepMin)} sleep · ` : ''}
        {sum.exerciseMinPerWeek} min exercise/week
        {sum.ketoneReadings ? ` · ${sum.ketoneReadings} ketone readings, avg ${sum.ketones} mmol/L` : ''}
        {sum.glucoseInRangePct != null ? ` · ${Math.round(sum.glucoseInRangePct)}% of CGM time in 70–140` : ''}.
      </p>
    </section>
  )
}
