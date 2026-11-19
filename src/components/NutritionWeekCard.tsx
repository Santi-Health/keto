import { useCallback, useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { dayEnergy } from '../lib/deficit'
import { shiftDay } from '../lib/goalPlan'
import { libraryFor, useCustomLifts } from '../lib/library'
import { addNutrients } from '../lib/nutrients'
import { foodLight, foodRows, liftLight, windowDays, type FoodRow, type Light, type NutritionDay } from '../lib/nutritionWeek'
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

/** ✓ met, ◐ short by 10% or less, ✗ short by more; a dash when there's nothing to judge yet. */
const MARK: Record<Light, { mark: string; word: string; bg: string }> = {
  green: { mark: '✓', word: 'met', bg: 'var(--accent)' },
  yellow: { mark: '◐', word: 'almost (within 10%)', bg: 'var(--carbs)' },
  red: { mark: '✗', word: 'missed by more than 10%', bg: 'var(--warn)' },
  none: { mark: '–', word: 'nothing to judge yet', bg: 'var(--border)' },
}
const VERDICT_CLS: Record<Light, string> = { green: 'good', yellow: 'close', red: 'behind', none: '' }

/** The week overall: ✓ when lifting and food are both met, ✗ when both missed by more than 10%, ◐ between. */
function overall(lift: Light, eat: Light): Light {
  const parts = [lift, eat].filter((l) => l !== 'none')
  if (!parts.length) return 'none'
  if (parts.every((l) => l === 'green')) return 'green'
  if (parts.every((l) => l === 'red')) return 'red'
  return 'yellow'
}

/** A small ✓ / ◐ / ✗ badge. */
function Mark({ light, label }: { light: Light; label: string }) {
  const m = MARK[light]
  return (
    <span
      aria-label={`${label}: ${m.word}`}
      title={`${label}: ${m.word}`}
      style={{ display: 'inline-grid', placeItems: 'center', width: '1.25em', height: '1.25em', borderRadius: '50%', background: m.bg, color: 'var(--surface)', fontSize: '0.8rem', fontWeight: 700 }}
    >
      {m.mark}
    </span>
  )
}

/** Plain dumbbell (lifting), in the text color. */
function Dumbbell() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
      <rect x="7" y="10.5" width="10" height="3" rx="1" />
      <rect x="3.5" y="6" width="3.5" height="12" rx="1.2" />
      <rect x="17" y="6" width="3.5" height="12" rx="1.2" />
      <rect x="1" y="9" width="2.5" height="6" rx="1" />
      <rect x="20.5" y="9" width="2.5" height="6" rx="1" />
    </svg>
  )
}

/** Plain strawberry (food), in the text color. */
function Strawberry() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
      <path d="M12 7.2c-4.6 0-7.6 2.3-7.6 5.6 0 4.1 3.9 9.2 7.6 9.2s7.6-5.1 7.6-9.2c0-3.3-3-5.6-7.6-5.6Z" />
      <path d="M12 7.6 9 4.6l2.2.4L12 2.6l.8 2.4 2.2-.4-3 3Z" />
      <g fill="var(--surface)">
        <circle cx="9" cy="11.5" r=".7" />
        <circle cx="12" cy="11" r=".7" />
        <circle cx="15" cy="11.5" r=".7" />
        <circle cx="10.4" cy="14.6" r=".7" />
        <circle cx="13.6" cy="14.6" r=".7" />
        <circle cx="12" cy="17.8" r=".7" />
      </g>
    </svg>
  )
}

/** Each week of the 12-week plan so far: muscle groups that got their sets, and the two food goals, on one line. */
export function PlanWeeksCard({ profile, targets, onUpdateProfile }: { profile: Profile; targets: Targets; onUpdateProfile: (changes: Partial<Profile>) => void }) {
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
        const liftMarked = (profile.liftDoneWeeks ?? []).includes(w.week)
        const groupsMet = liftMarked ? lifting.length : lifting.filter((g) => g.sets >= g.target).length
        const foodMet = food.filter((r) => r.met).length
        return { week: w.week, start, end: w.end, now: w.state === 'now', lifting, liftMarked, groupsMet, food, foodMet, lift: liftLight(lifting, liftMarked), eat: foodLight(food) }
      })
      .reverse()
  }, [plan, exercises, library, today, nutritionDay, profile.weightKg, profile.liftDoneWeeks])
  const [open, setOpen] = useState<number | null>(null)
  if (!weeks.length) return null
  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 8 }}>
        <h2>12-week plan, week by week</h2>
      </div>
      <div className="past-weeks">
        {weeks.map((w) => {
          return (
            <div key={w.week}>
              <button
                type="button"
                className={`past-week ${VERDICT_CLS[overall(w.lift, w.eat)]}`}
                aria-expanded={open === w.week}
                onClick={() => setOpen(open === w.week ? null : w.week)}
              >
                <span className="past-mark" aria-label={`Week ${w.week}: ${MARK[overall(w.lift, w.eat)].word}`}>
                  {MARK[overall(w.lift, w.eat)].mark}
                </span>
                <span>
                  Week {w.week} · {range(w.start, w.end)}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Dumbbell />
                  <Mark light={w.lift} label="Lifting" />
                  <span style={{ width: 6 }} />
                  <Strawberry />
                  <Mark light={w.eat} label="Food" />
                </span>
              </button>
              {open === w.week && (
                <div className="past-week-detail">
                  <div className="section-label" style={{ marginTop: 0 }}>
                    Lifting: sets per muscle group{w.liftMarked ? ' (you marked it done)' : ''}
                  </div>
                  <WeeklySetsBars coverage={w.lifting} />
                  <button
                    type="button"
                    className="link-btn small"
                    onClick={() => {
                      const marked = profile.liftDoneWeeks ?? []
                      onUpdateProfile({ liftDoneWeeks: w.liftMarked ? marked.filter((n) => n !== w.week) : [...marked, w.week] })
                    }}
                  >
                    {w.liftMarked ? 'Undo: count lifting from the sets again' : 'Mark lifting done for this week'}
                  </button>
                  <div className="section-label">Food: daily averages</div>
                  {w.food.some((r) => r.days) ? <FoodBars rows={w.food} /> : <p className="muted small" style={{ margin: 0 }}>No finished days with food logged yet.</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>
        Dumbbell: the week's sets per muscle group. Strawberry: average deficit 500+ kcal and protein 150+ g a day (finished days only). ✓ met · ◐
        short by 10% or less · ✗ short by more. The left mark is the week overall: ✓ both met, ✗ both missed, ◐ between. Tap a week for its bars{weeks[0]?.now ? '; this week is still counting' : ''}.
      </p>
    </section>
  )
}
