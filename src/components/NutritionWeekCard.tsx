import { useCallback, useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { dayEnergy } from '../lib/deficit'
import { shiftDay } from '../lib/goalPlan'
import { libraryFor, useCustomLifts } from '../lib/library'
import { addNutrients } from '../lib/nutrients'
import { foodRows, judgePlanWeek, windowDays, type FoodRow, type NutritionDay, type WeekVerdict } from '../lib/nutritionWeek'
import { localDate, type Targets } from '../lib/targets'
import { weekCoverage } from '../lib/training'
import type { Profile } from '../lib/types'
import { usePlanStatus } from './GoalPlanCard'
import { WeeklySetsBars } from './WeeklySetsCard'

/** How long ago a finished day was: yesterday, 2–3 days, 4–6 days, and 7 days ago (drops off tomorrow). */
const BANDS = [
  { label: 'yesterday', cls: 'age-0', from: 0, to: 0 },
  { label: '2–3 days ago', cls: 'age-1', from: 1, to: 2 },
  { label: '4–6 days ago', cls: 'age-2', from: 3, to: 5 },
  { label: '7 days ago (goes tomorrow)', cls: 'age-3', from: 6, to: 6 },
]

const fmtNum = (n: number) => Math.round(n).toLocaleString()
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const range = (a: string, b: string) => (a.slice(0, 7) === b.slice(0, 7) ? `${shortDate(a)}–${Number(b.slice(8))}` : `${shortDate(a)} – ${shortDate(b)}`)
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** A day's deficit and protein, for any day (memoized per render of the data). */
function useNutritionDay(bmr: number | null, refeedDate: string | null | undefined) {
  const { logsOn, exercisesOn, activity } = useData()
  return useCallback(
    (d: string): NutritionDay => {
      const logs = logsOn(d)
      const e = bmr == null ? null : dayEnergy({ day: d, bmr, logs, exercises: exercisesOn(d), activity: activity[d] && !activity[d].deleted_at ? activity[d] : null })
      return { day: d, logged: logs.length > 0, refeed: refeedDate === d, deficit: e?.deficit ?? 0, protein: addNutrients(logs.map((l) => l.nutrients)).protein }
    },
    [logsOn, exercisesOn, activity, bmr, refeedDate],
  )
}

/** Average deficit and protein against their goals; with `aged`, each bar is split by how long ago its days were. */
function FoodBars({ rows, aged = false }: { rows: FoodRow[]; aged?: boolean }) {
  return (
    <div className="coach-sets">
      {rows.map((r) => {
        const scale = Math.max(r.goal, r.avg ?? 0)
        return (
          <div key={r.key}>
            <span>
              {r.label}
              <span className="muted" style={{ display: 'block', fontSize: '0.72rem', textAlign: 'left' }}>
                {r.avg == null ? 'nothing logged' : `avg a day, ${r.unit}`}
              </span>
            </span>
            <span className="coach-bar" aria-hidden="true">
              {aged ? (
                [...BANDS].reverse().map((b) => {
                  const v = r.byAge.slice(b.from, b.to + 1).reduce((a, x) => a + x, 0)
                  return v > 0 ? <span key={b.cls} className={`age ${b.cls}`} style={{ width: `${(v / scale) * 100}%` }} /> : null
                })
              ) : (
                <span style={{ width: `${Math.min(100, ((r.avg ?? 0) / r.goal) * 100)}%`, background: r.met ? 'var(--accent)' : 'var(--protein)' }} />
              )}
            </span>
            <span className={`muted small ${r.met ? 'set-met' : ''}`} style={{ whiteSpace: 'nowrap' }}>
              {r.avg == null ? '–' : fmtNum(r.avg)}/{r.goal}
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

/** Today's card: average deficit and protein over the last 7 finished days, against 500+ kcal and 150+ g. */
export function NutritionWeekCard({ day, profile, targets }: { day: string; profile: Profile; targets: Targets }) {
  const today = localDate()
  const nutritionDay = useNutritionDay(targets.bmr, profile.refeedDate)
  const days = useMemo(() => windowDays(day, today).map(nutritionDay), [day, today, nutritionDay])
  // Without a burn there's no deficit to judge.
  const rows = useMemo(() => foodRows(days).filter((r) => targets.bmr != null || r.key !== 'deficit'), [days, targets.bmr])
  const short = rows.filter((r) => !r.met).length
  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 8 }}>
        <h2>Deficit & protein, last 7 days</h2>
        <span className={`badge ${short ? '' : 'ok'}`}>{short ? `${short} short` : 'Both on target'}</span>
      </div>
      <FoodBars rows={rows} aged />
      <p className="muted small" style={{ marginBottom: 0 }}>
        Daily averages, {fmtDay(days[0].day)} to {days[6].day === shiftDay(today, -1) ? 'yesterday' : fmtDay(days[6].day)}, over the days with food
        logged. Goals: a deficit of 500+ kcal and 150+ g of protein a day. Today joins tomorrow, once it's finished.
      </p>
    </section>
  )
}

const MARK: Record<WeekVerdict, { mark: string; label: string }> = {
  good: { mark: '✓', label: 'Week done' },
  close: { mark: '◐', label: 'Partly done' },
  behind: { mark: '✗', label: 'Behind' },
}

/** Each week of the 12-week plan so far: muscle groups that got their sets, and the two food goals, on one line. */
export function PlanWeeksCard({ profile, targets }: { profile: Profile; targets: Targets }) {
  const today = localDate()
  const { exercises } = useData()
  const { custom } = useCustomLifts()
  const library = useMemo(() => libraryFor(undefined, custom), [custom])
  const nutritionDay = useNutritionDay(targets.bmr, profile.refeedDate)
  const plan = usePlanStatus(profile.goalPlan, targets.bmr)
  const weeks = useMemo(() => {
    if (!plan) return []
    return plan.weeks
      .filter((w) => w.state !== 'ahead')
      .map((w) => {
        const start = shiftDay(w.end, -6)
        // Lifting counts today's sets; food only finished days.
        const lifting = weekCoverage(exercises, library, w.end < today ? w.end : today, start, profile.weightKg)
        const foodDays: NutritionDay[] = []
        for (let d = start; d <= w.end && d < today; d = shiftDay(d, 1)) foodDays.push(nutritionDay(d))
        const food = foodRows(foodDays)
        const groupsMet = lifting.filter((g) => g.sets >= g.target).length
        const foodMet = food.filter((r) => r.met).length
        return { week: w.week, start, end: w.end, now: w.state === 'now', lifting, groupsMet, food, foodMet, verdict: judgePlanWeek(groupsMet, lifting.length, foodMet, food.length) }
      })
      .reverse()
  }, [plan, exercises, library, today, nutritionDay, profile.weightKg])
  const [open, setOpen] = useState<number | null>(null)
  if (!weeks.length) return null
  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 8 }}>
        <h2>12-week plan, week by week</h2>
      </div>
      <div className="past-weeks">
        {weeks.map((w) => {
          const v = MARK[w.verdict]
          return (
            <div key={w.week}>
              <button type="button" className={`past-week ${w.verdict}`} aria-expanded={open === w.week} onClick={() => setOpen(open === w.week ? null : w.week)}>
                <span className="past-mark" aria-label={v.label}>
                  {v.mark}
                </span>
                <span>
                  Week {w.week} · {range(w.start, w.end)}
                </span>
                <span className="muted small" style={{ whiteSpace: 'nowrap' }}>
                  Lift {w.groupsMet}/{w.lifting.length} · Food {w.foodMet}/{w.food.length}
                </span>
              </button>
              {open === w.week && (
                <div className="past-week-detail">
                  <div className="section-label" style={{ marginTop: 0 }}>Lifting: sets per muscle group</div>
                  <WeeklySetsBars coverage={w.lifting} />
                  <div className="section-label">Food: daily averages</div>
                  {w.food.some((r) => r.days) ? <FoodBars rows={w.food} /> : <p className="muted small" style={{ margin: 0 }}>No finished days with food logged yet.</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>
        Lift: muscle groups that got their weekly sets. Food: average deficit 500+ kcal and protein 150+ g a day (finished days only). ✓ all done · ◐
        partly · ✗ under 5 groups and no food goal. Tap a week for its bars{weeks[0]?.now ? '; this week is still counting' : ''}.
      </p>
    </section>
  )
}
