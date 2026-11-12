import { useMemo, useState } from 'react'
import { A1cCard } from '../components/A1cCard'
import { BodyScanCard } from '../components/BodyScan'
import { KetoModelCard } from '../components/KetoModelCard'
import { TrendsCard } from '../components/TrendsCard'
import { GOALS, buildCoach, goalLabel, topTips, weekPace, type CoachSection, type CoachTip } from '../lib/coach'
import { toReadings } from '../lib/cgm'
import { useData } from '../lib/data'
import { dayEnergy } from '../lib/deficit'
import { daysSinceStrength } from '../lib/exercise'
import { foodImpacts, mealResponses, oddThings } from '../lib/glucoseInsights'
import { estimateKetosis, tomorrowMorning } from '../lib/ketosis'
import { libraryFor, useCustomLifts } from '../lib/library'
import { addNutrients } from '../lib/nutrients'
import { readinessFor } from '../lib/readiness'
import { scansOf } from '../lib/bodyScan'
import { suggestFixes } from '../lib/suggest'
import { liveFatBudget, localDate, type Targets } from '../lib/targets'
import { entryDay } from '../lib/time'
import { groupsDue, hardCardioThisWeek, liftPlans, liftStreak, weekCoverage } from '../lib/training'
import { lastDays, type RangeDays } from '../lib/trends'
import type { Profile, WeightUnit } from '../lib/types'
import { useKetoModel } from '../lib/useKetoModel'
import { computeWatchList } from '../lib/watchlist'

interface Props {
  profile: Profile
  targets: Targets
  weightUnit: WeightUnit
  onApplyLimit: (g: number) => void
  onOpenReport: (days: RangeDays) => void
}

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return localDate(d)
}

const SECTIONS: { id: CoachSection; title: string; blurb: string }[] = [
  { id: 'food', title: 'Food & macros', blurb: 'Protein to keep muscle, a deficit that burns fat without costing it.' },
  { id: 'keto', title: 'Ketosis', blurb: 'Where your ketones are and what moves them.' },
  { id: 'sugar', title: 'Blood sugar', blurb: 'What spikes you, from your CGM.' },
  { id: 'training', title: 'Training & muscle', blurb: 'What your week is missing and the next numbers for each lift.' },
  { id: 'abs', title: 'Abs & chest', blurb: 'Muscle to show, and the body fat that hides it.' },
]

/** One recommendation: what to do, which goal it serves, and what it costs another goal. */
function Tip({ t }: { t: CoachTip }) {
  return (
    <div className={`coach-tip ${t.tone}`}>
      <div className="coach-tip-head">
        <b>{t.title}</b>
        <span className="coach-goal">{goalLabel(t.goal)}</span>
      </div>
      {t.detail && <div className="muted small">{t.detail}</div>}
      {t.tradeoff && <div className="coach-tradeoff small">⚖︎ {t.tradeoff}</div>}
    </div>
  )
}

/** Every recommendation in one place, grouped by topic, each tied to one of your goals. */
export function Coach({ profile, targets, weightUnit, onApplyLimit, onOpenReport }: Props) {
  const { logs, foods, exercises, activity, readings, cgmDays, logsOn, logsWeekEnding, exercisesOn } = useData()
  const { custom } = useCustomLifts()
  const today = localDate()
  const yesterday = shift(today, -1)
  const ketoModel = useKetoModel(targets.netCarbsG, targets.proteinG)
  const [showGoals, setShowGoals] = useState(false)

  const tips = useMemo(() => {
    const dayLogs = logsOn(today)
    const n = addNutrients(dayLogs.map((l) => l.nutrients))
    const weekLogs = logsWeekEnding(today)
    const ctx = { calorieTarget: targets.calories, weightKg: profile.weightKg }
    const watch = computeWatchList(dayLogs.map((l) => l.nutrients), weekLogs.map((l) => l.nutrients), ctx, profile.watchList)
    const suggestions = suggestFixes({
      dayLogs,
      history: logs,
      foods,
      targets,
      muscleGoal: profile.muscleGoal,
      fatBudget: liveFatBudget(targets, { protein: n.protein, netCarbs: n.netCarbs }),
      past: false,
      sex: profile.sex,
      watch: { ctx, settings: profile.watchList, weekItems: weekLogs.filter((l) => !dayLogs.includes(l)).map((l) => l.nutrients) },
    })
    const week = targets.bmr == null
      ? []
      : lastDays(7, yesterday).map((d) => dayEnergy({ day: d, bmr: targets.bmr!, logs: logsOn(d), exercises: exercisesOn(d), activity: activity[d] && !activity[d].deleted_at ? activity[d] : null }))
    const ketoOpts = { logs, exercises, netCarbLimit: targets.netCarbsG, proteinTarget: targets.proteinG, model: ketoModel.adjuster }
    const library = libraryFor(undefined, custom)
    const coverage = weekCoverage(exercises, library, today)
    // Blood sugar: what happened today and yesterday, and foods ranked over 14 days.
    const odd = [yesterday, today].flatMap((d) => {
      const rs = cgmDays[d] && !cgmDays[d].deleted_at ? toReadings([cgmDays[d]]) : []
      const l = logsOn(d)
      const ex = exercisesOn(d)
      return rs.length ? oddThings(rs, l, ex, mealResponses(l, rs, ex)) : []
    })
    const from = shift(today, -13)
    const recentCgm = Object.values(cgmDays).filter((d) => !d.deleted_at && d.day >= from)
    const spikeFoods = foodImpacts(
      mealResponses(
        logs.filter((l) => entryDay(l.eaten_at, l.meta?.tz) >= from),
        toReadings(recentCgm),
        exercises.filter((e) => entryDay(e.started_at, e.meta?.tz) >= from),
      ),
    )
    const scans = scansOf(readings).map((r) => ({ date: entryDay(r.taken_at, r.meta?.tz), scan: r.meta.scan! }))
    return {
      all: buildCoach({
        today,
        suggestions,
        proteinTargetG: targets.proteinG,
        proteinTodayG: n.protein,
        netCarbLimitG: targets.netCarbsG,
        muscleWarning: targets.muscleWarning,
        week,
        watch,
        ketoNow: estimateKetosis({ ...ketoOpts, at: Date.now() }),
        ketoTomorrow: estimateKetosis({ ...ketoOpts, at: tomorrowMorning() }),
        readiness: readinessFor(today, activity),
        coverage,
        due: groupsDue(coverage),
        plans: liftPlans(exercises, library, today),
        daysSinceStrength: daysSinceStrength(exercises),
        liftStreak: liftStreak(exercises, today),
        hardCardio: hardCardioThisWeek(exercises, today),
        odd,
        spikeFoods,
        cgmDays: recentCgm.filter((d) => d.day >= shift(today, -6)).length,
        scans,
      }),
      plans: liftPlans(exercises, library, today),
      coverage,
      spikeFoods,
      pace: weekPace(week),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, foods, exercises, activity, readings, cgmDays, targets, profile, custom, ketoModel, today])

  const top = topTips(tips.all)

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Coach</h1>
          <div className="muted small">Every tip says which goal it serves and what it costs another.</div>
        </div>
      </header>

      <section className="card">
        <div className="page-header" style={{ marginBottom: 6 }}>
          <h2>Focus now</h2>
          <button type="button" className="link-btn small" aria-expanded={showGoals} onClick={() => setShowGoals(!showGoals)}>
            {showGoals ? 'Hide goals' : 'Your goals'}
          </button>
        </div>
        {showGoals && (
          <ol className="coach-goals small">
            {GOALS.filter((g) => g.id !== 'health').map((g) => (
              <li key={g.id}>{g.label}</li>
            ))}
            <li className="muted" style={{ listStyle: 'none' }}>When two goals pull apart, the higher one wins, or the tip offers a way to serve both.</li>
          </ol>
        )}
        {top.length ? top.map((t) => <Tip key={t.id} t={t} />) : <p className="muted small" style={{ margin: 0 }}>Nothing pressing: you're on track across your goals.</p>}
      </section>

      <div className="grid two">
        {SECTIONS.map((s) => {
          const mine = tips.all.filter((t) => t.section === s.id)
          return (
            <div key={s.id} className="grid">
            <section className="card">
              <h2>{s.title}</h2>
              <p className="muted small" style={{ marginTop: 0 }}>{s.blurb}</p>
              {mine.map((t) => (
                <Tip key={t.id} t={t} />
              ))}
              {!mine.length && <p className="muted small" style={{ margin: 0 }}>Nothing to change here right now.</p>}

              {s.id === 'training' && tips.plans.length > 0 && (
                <>
                  <div className="section-label">Next time, lift by lift</div>
                  {tips.plans.map((p) => (
                    <div key={p.name} className="coach-lift">
                      <div className="coach-tip-head">
                        <b>{p.name}</b>
                        <span className="muted small">
                          last {p.last.weight != null && p.last.weight > 0 ? `${p.last.weight} ${p.last.unit}${p.last.bells === 2 ? ' ×2' : ''} · ` : ''}
                          {p.last.reps ?? '?'}×{p.last.sets ?? '?'}
                        </span>
                      </div>
                      <div className="muted small">
                        {p.text} <span className="coach-goal">{p.next.change === 'weight' ? goalLabel('strength') : goalLabel('muscle')}</span>
                      </div>
                    </div>
                  ))}
                  <p className="muted small" style={{ marginBottom: 0 }}>
                    Big lifts 6–10 reps, smaller and core 10–15. Add reps until the top of the range, then add weight and drop back down.
                  </p>
                </>
              )}
              {s.id === 'training' && (
                <>
                  <div className="section-label">Sets this week (last 7 days)</div>
                  <div className="coach-sets">
                    {tips.coverage.map((g) => (
                      <div key={g.group}>
                        <span>{g.group}</span>
                        <span className="coach-bar" aria-hidden="true">
                          <span style={{ width: `${Math.min(100, (g.sets / g.target) * 100)}%`, background: g.sets >= g.target ? 'var(--accent)' : 'var(--protein)' }} />
                        </span>
                        <span className="muted small">
                          {g.sets}/{g.target}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {s.id === 'sugar' && (
                <>
                  {tips.spikeFoods.length > 0 && (
                    <>
                      <div className="section-label">Your foods, last 14 days</div>
                      {tips.spikeFoods.slice(0, 10).map((f) => (
                        <div key={f.name} className="watch-row">
                          <span>
                            <span className={`dot ${f.level === 'spike' ? 'over' : f.level === 'moderate' ? 'near' : ''}`} aria-hidden="true" />
                            {f.name}
                          </span>
                          <span className="muted">
                            +{f.avgRise} mg/dL · {f.events}×
                          </span>
                        </div>
                      ))}
                      <p className="muted small" style={{ marginBottom: 0 }}>
                        Average rise after meals that included the food. Mixed meals share the credit, so treat it as a hint.
                      </p>
                    </>
                  )}
                </>
              )}
            </section>
            {s.id === 'keto' && <KetoModelCard model={ketoModel} netCarbLimit={targets.netCarbsG} onApplyLimit={onApplyLimit} />}
            {s.id === 'sugar' && <A1cCard />}
            </div>
          )
        })}
      </div>

      <h2 className="coach-progress-title">Progress toward your goals</h2>
      <div className="grid two">
        <BodyScanCard />
        <TrendsCard targets={targets} weightUnit={weightUnit} onOpenReport={onOpenReport} />
      </div>
    </>
  )
}
