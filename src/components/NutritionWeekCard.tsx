import { useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { dayEnergy } from '../lib/deficit'
import { shiftDay } from '../lib/goalPlan'
import { addNutrients } from '../lib/nutrients'
import { judgeNutrition, nutritionRows, planWeekVerdict, windowDays, type NutritionDay, type NutritionGoals, type NutritionRow, type NutritionVerdict } from '../lib/nutritionWeek'
import { localDate, type Targets } from '../lib/targets'
import type { Profile } from '../lib/types'
import { usePlanStatus } from './GoalPlanCard'

/** How long ago a finished day was: yesterday, 2–3 days, 4–6 days, and 7 days ago (drops off tomorrow). */
const BANDS = [
  { label: 'yesterday', cls: 'age-0', from: 0, to: 0 },
  { label: '2–3 days ago', cls: 'age-1', from: 1, to: 2 },
  { label: '4–6 days ago', cls: 'age-2', from: 3, to: 5 },
  { label: '7 days ago (goes tomorrow)', cls: 'age-3', from: 6, to: 6 },
]

const fmtNum = (n: number) => Math.round(n).toLocaleString()

/** Bars of days on target per goal; with `aged`, split by how long ago each day was, oldest on the left. */
function NutritionBars({ rows, aged = false }: { rows: NutritionRow[]; aged?: boolean }) {
  return (
    <div className="coach-sets">
      {rows.map((r) => {
        const met = r.hits >= r.need
        return (
          <div key={r.key}>
            <span>
              {r.label}
              <span className="muted" style={{ display: 'block', fontSize: '0.72rem', textAlign: 'left' }}>
                {r.avg == null ? 'nothing logged' : `avg ${fmtNum(r.avg)} ${r.unit}`} · {r.goal}
              </span>
            </span>
            <span className="coach-bar" aria-hidden="true">
              {aged ? (
                [...BANDS].reverse().map((b) => {
                  const v = r.byAge.slice(b.from, b.to + 1).reduce((a, x) => a + x, 0)
                  return v > 0 ? <span key={b.cls} className={`age ${b.cls}`} style={{ width: `${(v / r.days) * 100}%` }} /> : null
                })
              ) : (
                <span style={{ width: `${(r.hits / r.days) * 100}%`, background: met ? 'var(--accent)' : 'var(--protein)' }} />
              )}
            </span>
            <span className={`muted small ${aged && met ? 'set-met' : ''}`}>
              {r.hits}/{r.days}
            </span>
          </div>
        )
      })}
      {aged && (
        <div className="age-legend muted small">
          {BANDS.map((b) => (
            <span key={b.cls}>
              <i className={`age-key ${b.cls}`} /> {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const MARK: Record<NutritionVerdict, { mark: string; label: string }> = {
  good: { mark: '✓', label: 'On track' },
  close: { mark: '◐', label: 'Close' },
  behind: { mark: '✗', label: 'Behind' },
}
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const range = (a: string, b: string) => (a.slice(0, 7) === b.slice(0, 7) ? `${shortDate(a)}–${Number(b.slice(8))}` : `${shortDate(a)} – ${shortDate(b)}`)
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** Today's card: days the deficit and each macro hit their goal over the last 7 finished days, and the plan's weeks. */
export function NutritionWeekCard({ day, profile, targets }: { day: string; profile: Profile; targets: Targets }) {
  const { logsOn, exercisesOn, activity } = useData()
  const today = localDate()
  const goals: NutritionGoals = { proteinG: targets.proteinG, netCarbsG: targets.netCarbsG, fatMinG: targets.fatMinG }
  const bmr = targets.bmr

  const nutritionDay = useMemo(() => {
    const cache = new Map<string, NutritionDay>()
    return (d: string): NutritionDay => {
      const hit = cache.get(d)
      if (hit) return hit
      const logs = logsOn(d)
      const n = addNutrients(logs.map((l) => l.nutrients))
      const e = bmr == null ? null : dayEnergy({ day: d, bmr, logs, exercises: exercisesOn(d), activity: activity[d] && !activity[d].deleted_at ? activity[d] : null })
      const out = {
        day: d,
        logged: logs.length > 0,
        refeed: profile.refeedDate === d,
        deficit: e?.deficit ?? 0,
        burned: e?.burned ?? 0,
        kcal: n.kcal,
        protein: n.protein,
        netCarbs: n.netCarbs,
        fat: n.fat,
      }
      cache.set(d, out)
      return out
    }
  }, [logsOn, exercisesOn, activity, bmr, profile.refeedDate])

  const days = useMemo(() => windowDays(day, today).map(nutritionDay), [day, today, nutritionDay])
  // Without a burn there's no deficit to judge.
  const rows = useMemo(() => nutritionRows(days, goals).filter((r) => bmr != null || r.key !== 'deficit'), [days, goals.proteinG, goals.netCarbsG, goals.fatMinG, bmr]) // eslint-disable-line react-hooks/exhaustive-deps
  const short = rows.filter((r) => r.hits < r.need).length

  const plan = usePlanStatus(profile.goalPlan, bmr)
  const planWeeks = useMemo(() => {
    if (!plan) return []
    return plan.weeks
      .filter((w) => w.state !== 'ahead' && w.actualFatLb != null)
      .map((w) => {
        const start = shiftDay(w.end, -6)
        const last = w.end < today ? w.end : shiftDay(today, -1)
        const weekDays: string[] = []
        for (let d = start; d <= last; d = shiftDay(d, 1)) weekDays.push(d)
        const wRows = nutritionRows(weekDays.map(nutritionDay), goals)
        const aheadLb = w.targetFatLb - w.actualFatLb!
        const met = judgeNutrition(wRows).met
        return { week: w.week, start, end: w.end, aheadLb, verdict: planWeekVerdict(aheadLb, met === wRows.length), rows: wRows, met }
      })
      .reverse()
  }, [plan, today, nutritionDay]) // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 8 }}>
        <h2>Macros & deficit, last 7 days</h2>
        <span className={`badge ${short ? '' : 'ok'}`}>{short ? `${short} short` : 'All on target'}</span>
      </div>
      <NutritionBars rows={rows} aged />
      <p className="muted small" style={{ marginBottom: 0 }}>
        Days on target, {fmtDay(days[0].day)} to {days[6].day === shiftDay(today, -1) ? 'yesterday' : fmtDay(days[6].day)}: a goal is met on 5 of 7 days. Today joins
        tomorrow, once it's finished. Deficit {rows.find((r) => r.key === 'deficit')?.goal ?? ''} kcal: less barely burns fat, more starts costing
        muscle.
      </p>

      {planWeeks.length > 0 && <div className="section-label">12-week plan, week by week</div>}
      <div className="past-weeks">
        {planWeeks.map((w) => {
          const v = MARK[w.verdict]
          const ahead = Math.abs(w.aheadLb) < 0.3 ? 'on track' : w.aheadLb > 0 ? `${w.aheadLb.toFixed(1)} lb ahead` : `${Math.abs(w.aheadLb).toFixed(1)} lb behind`
          return (
            <div key={w.week}>
              <button type="button" className={`past-week ${w.verdict}`} aria-expanded={open === w.week} onClick={() => setOpen(open === w.week ? null : w.week)}>
                <span className="past-mark" aria-label={v.label}>
                  {v.mark}
                </span>
                <span>
                  Week {w.week} · {range(w.start, w.end)}
                </span>
                <span className="muted small">
                  {ahead} · {w.met}/{w.rows.length}
                </span>
              </button>
              {open === w.week && (
                <div className="past-week-detail">
                  {w.rows[0]?.days ? <NutritionBars rows={w.rows} /> : <p className="muted small" style={{ margin: 0 }}>No finished days yet.</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {planWeeks.length > 0 && (
        <p className="muted small" style={{ marginBottom: 0 }}>
          ✓ fat on target and every goal met (5 of 7 days) · ◐ on target with goals short, or within half a pound · ✗ more than half a pound
          behind. The count is goals met that week (so far, for this one). Tap a week for its bars.
        </p>
      )}
    </section>
  )
}
