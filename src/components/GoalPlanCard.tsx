import { useMemo, useState } from 'react'
import { scansOf } from '../lib/bodyScan'
import { useData } from '../lib/data'
import { dayEnergy } from '../lib/deficit'
import { RESCAN_WEEKS, planStatus, shiftDay, type GoalPlan, type PlanStatus } from '../lib/goalPlan'
import { localDate, type Targets } from '../lib/targets'
import { entryDay } from '../lib/time'
import type { WeightUnit } from '../lib/types'
import { ReadingSheet } from './ReadingSheet'

const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const sign = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`

/** The plan's status from the latest scan, logged deficit and weigh-ins. */
export function usePlanStatus(plan: GoalPlan | undefined, bmr: number | null): PlanStatus | null {
  const { readings, logsOn, exercisesOn, activity } = useData()
  const today = localDate()
  return useMemo(() => {
    if (!plan || bmr == null) return null
    const scans = scansOf(readings).map((r) => ({ date: entryDay(r.taken_at, r.meta?.tz), scan: r.meta.scan! }))
    const scan = [...scans].reverse().find((s) => s.date <= plan.start) ?? scans[scans.length - 1]
    if (!scan) return null
    const energy = []
    for (let d = scan.date; d < today; d = shiftDay(d, 1)) {
      energy.push(dayEnergy({ day: d, bmr, logs: logsOn(d), exercises: exercisesOn(d), activity: activity[d] && !activity[d].deleted_at ? activity[d] : null }))
    }
    const weights = readings
      .filter((r) => r.kind === 'weight' && r.value != null && !r.deleted_at)
      .map((r) => ({ day: entryDay(r.taken_at, r.meta?.tz), kg: r.value! }))
    return planStatus({ plan, today, scan, energy, weights })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, bmr, readings, activity, today, logsOn, exercisesOn])
}

/** Target weight line over the 12 weeks, your weekly weigh-in averages as dots, and a marker for today. */
function PlanChart({ s }: { s: PlanStatus }) {
  const W = 300
  const H = 120
  const L = 34
  const R = 8
  const T = 10
  const B = 18
  const startW = s.fatFreeLb + s.startFatLb
  const ins = s.weeks.filter((w) => w.weighInLb != null)
  const hi = Math.max(startW, ...ins.map((w) => w.weighInLb!)) + 1
  const lo = Math.min(s.goalWeightLb, ...ins.map((w) => w.weighInLb!)) - 1
  const x = (week: number) => L + (week / s.plan.weeks) * (W - L - R)
  const y = (lb: number) => T + ((hi - lo ? (hi - lb) / (hi - lo) : 0.5) * (H - T - B))
  const now = Math.min(s.plan.weeks, s.day / 7)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="plan-chart" role="img" aria-label={`Target weight from ${startW.toFixed(1)} to ${s.goalWeightLb} lb over ${s.plan.weeks} weeks`}>
      {[startW, s.goalWeightLb].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--track)" strokeWidth="1" />
          <text x={L - 4} y={y(v) + 3} textAnchor="end" fontSize="8.5" fill="var(--text-2)">
            {v.toFixed(0)}
          </text>
        </g>
      ))}
      {[1, 6, 12].map((w) => (
        <text key={w} x={x(w)} y={H - 4} textAnchor="middle" fontSize="8.5" fill="var(--text-2)">
          wk {w}
        </text>
      ))}
      <line x1={x(0)} y1={y(startW)} x2={x(s.plan.weeks)} y2={y(s.goalWeightLb)} stroke="var(--text-2)" strokeWidth="1.5" strokeDasharray="4 3" />
      <line x1={x(now)} x2={x(now)} y1={T} y2={H - B} stroke="var(--accent)" strokeWidth="1" />
      {ins.map((w) => (
        <circle key={w.week} cx={x(w.week - 0.5)} cy={y(w.weighInLb!)} r="4.5" fill="var(--protein)" stroke="var(--surface)" strokeWidth="2" />
      ))}
    </svg>
  )
}

interface Props {
  plan: GoalPlan | undefined
  targets: Targets
  weightUnit: WeightUnit
  onStart: (plan: GoalPlan) => void
}

/** Week N of the plan to 12% body fat: target vs. where you are, and where this pace lands you. */
export function GoalPlanCard({ plan, targets, weightUnit, onStart }: Props) {
  const s = usePlanStatus(plan, targets.bmr)
  const [weighIn, setWeighIn] = useState(false)
  const [showWeeks, setShowWeeks] = useState(false)

  if (!plan) {
    return (
      <section className="card">
        <h2>12-week plan</h2>
        <p className="muted small">From your last DEXA to 12% body fat in 12 weeks, keeping your lean mass. Week by week targets, and a prediction from your deficit and weigh-ins.</p>
        <button type="button" className="btn" onClick={() => onStart({ start: localDate(), weeks: 12, targetBfPct: 12 })}>
          Start my 12-week plan today
        </button>
      </section>
    )
  }
  if (!s) {
    return (
      <section className="card">
        <h2>12-week plan</h2>
        <p className="muted small" style={{ margin: 0 }}>Needs a DEXA scan with weight, fat and lean mass (Body composition, below) and your height in Settings.</p>
      </section>
    )
  }
  const end = shiftDay(s.plan.start, s.plan.weeks * 7 - 1)
  const current = s.weeks[Math.min(s.plan.weeks, Math.max(1, s.week)) - 1]
  const status = Math.abs(s.aheadLb) < 0.3 ? 'On track' : s.aheadLb > 0 ? `${s.aheadLb.toFixed(1)} lb ahead` : `${Math.abs(s.aheadLb).toFixed(1)} lb behind`
  const targetLost = s.startFatLb - s.targetTodayFatLb
  const rescans = RESCAN_WEEKS.map((w) => ({ week: w, day: shiftDay(s.plan.start, w * 7 - 1) }))
  const nextScan = rescans.find((r) => r.day >= localDate())

  return (
    <section className="card plan-card">
      <div className="page-header" style={{ marginBottom: 4 }}>
        <h2>12-week plan</h2>
        <span className={`badge ${s.aheadLb >= -0.3 ? 'ok' : 'warn'}`}>{status}</span>
      </div>
      <div className="muted small">
        {s.week === 0 ? 'Starts' : s.week > s.plan.weeks ? 'Ended' : `Week ${s.week} of ${s.plan.weeks}`} · {fmtDate(s.plan.start)} → {fmtDate(end)} · {s.baseline.bfPct}% → {s.plan.targetBfPct}% holding {s.baseline.leanLb} lb lean
      </div>

      <div className="stat-grid plan-stats">
        <div>
          <b>{targetLost.toFixed(1)} lb</b>
          <span>Fat to be lost by today</span>
        </div>
        <div>
          <b>{s.lostByDeficitLb.toFixed(1)} lb</b>
          <span>Lost, by your logged deficit</span>
        </div>
        <div>
          <b>{s.lostByScaleLb == null ? '—' : `${Math.abs(s.lostByScaleLb).toFixed(1)} lb`}</b>
          <span>{s.lostByScaleLb == null ? 'Weigh in to check on the scale' : s.lostByScaleLb < 0 ? 'Up on the scale (7-day avg; often water)' : 'Lost, by your weigh-ins (7-day avg)'}</span>
        </div>
        <div>
          <b>{s.bfByDeficit}%</b>
          <span>Body fat now (est.){s.bfByScale != null ? ` · scale ${s.bfByScale}%` : ''}</span>
        </div>
      </div>

      <PlanChart s={s} />
      <p className="muted small" style={{ margin: '2px 0 8px' }}>
        Dashed: target weight ({(s.fatFreeLb + s.startFatLb).toFixed(1)} → {s.goalWeightLb} lb). Dots: your weekly weigh-in average. Line: today.
      </p>

      <p className="small" style={{ margin: '0 0 6px' }}>
        {current && s.week >= 1 && s.week <= s.plan.weeks && (
          <>
            <b>This week's target:</b> {current.targetWeightLb} lb, {current.targetBfPct}% body fat by {fmtDate(current.end)}.{' '}
          </>
        )}
        The plan needs about <b>{s.dailyDeficit} kcal a day</b> under your burn ({s.perWeekLb.toFixed(2)} lb of fat a week); your 500 target leaves room for holidays.
      </p>
      <p className="small" style={{ margin: '0 0 6px' }}>
        <b>Prediction:</b>{' '}
        {s.paceLbPerWeek == null
          ? 'needs 5+ days of logged food in the last 2 weeks.'
          : s.paceLbPerWeek <= 0.05
            ? `your last 2 weeks show no deficit (${sign(-s.paceLbPerWeek)} lb/week), so the goal moves away.`
            : `at your last-2-weeks pace (${s.paceLbPerWeek.toFixed(2)} lb of fat a week) you'd finish week ${s.plan.weeks} at about ${s.predictedBfPct}%${s.weeksToGoal != null ? `, reaching ${s.plan.targetBfPct}% in about ${Math.ceil(s.weeksToGoal)} more week${Math.ceil(s.weeksToGoal) === 1 ? '' : 's'}` : ''}.`}
      </p>
      <p className="muted small" style={{ margin: '0 0 10px' }}>
        Weigh in 2–3 times a week, mornings before food: keto water moves the scale 2–3 lb, so the weekly average is what counts.{' '}
        {nextScan && `DEXA retest around ${fmtDate(nextScan.day)} (week ${nextScan.week}) to confirm the loss is fat, not muscle.`}
      </p>

      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn secondary" onClick={() => setWeighIn(true)}>
          ⚖︎ Log a weigh-in
        </button>
        <button type="button" className="link-btn small" aria-expanded={showWeeks} onClick={() => setShowWeeks(!showWeeks)}>
          {showWeeks ? 'Hide weeks' : 'Week by week'}
        </button>
      </div>

      {showWeeks && (
        <div className="plan-weeks">
          <div className="plan-week head">
            <span>Week</span>
            <span>Target</span>
            <span>Body fat</span>
            <span>Your avg</span>
          </div>
          {s.weeks.map((w) => (
            <div key={w.week} className={`plan-week ${w.week === s.week ? 'now' : ''}`}>
              <span>
                {w.week} · {fmtDate(w.end)}
                {RESCAN_WEEKS.includes(w.week) ? ' · DEXA' : ''}
              </span>
              <span>{w.targetWeightLb} lb</span>
              <span>{w.targetBfPct}%</span>
              <span className={w.weighInLb == null ? 'muted' : ''}>
                {w.weighInLb == null ? '—' : `${w.weighInLb} lb${w.weighInLb <= w.targetWeightLb ? ' ✓' : ''}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {weighIn && <ReadingSheet weightUnit={weightUnit} netCarbLimit={targets.netCarbsG} proteinTarget={targets.proteinG} kind="weight" onClose={() => setWeighIn(false)} />}
    </section>
  )
}
