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
import { exercisesFor, groupsDue, hardCardioThisWeek, liftDaysThisWeek, liftPlans, liftStreak, weekCoverage } from '../lib/training'
import { WeeklySetsBars } from '../components/WeeklySetsCard'
import { GoalPlanCard } from '../components/GoalPlanCard'
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
  onUpdateProfile: (changes: Partial<Profile>) => void
}

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return localDate(d)
}

const SECTIONS: { id: CoachSection; title: string; blurb: string }[] = [
  { id: 'nutrition', title: 'Nutrition', blurb: 'Deficit, protein and ketosis together: burn fat without costing muscle.' },
  { id: 'sugar', title: 'Blood sugar', blurb: 'Only what your CGM shows that you wouldn’t guess.' },
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
export function Coach({ profile, targets, weightUnit, onApplyLimit, onOpenReport, onUpdateProfile }: Props) {
  const disliked = useMemo(() => profile.dislikedLifts ?? [], [profile.dislikedLifts])
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
    const due = groupsDue(coverage)
    // Every group short of its sets, the ones due next first, each with two exercises to fill it.
    const short = [...due, ...coverage.filter((g) => g.sets < g.target && !due.includes(g))]
    const picks = short.map((g) => ({ group: g.group, short: g.target - g.sets, picks: exercisesFor(g.group, { exercises, library, today, disliked }) }))
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
        due,
        picks: Object.fromEntries(picks.map((p) => [p.group, p.picks.map((x) => x.name)])),
        plans: liftPlans(exercises, library, today),
        daysSinceStrength: daysSinceStrength(exercises),
        liftStreak: liftStreak(exercises, today),
        hardCardio: hardCardioThisWeek(exercises, today),
        doneToday: {
          strength: exercisesOn(today).some((e) => e.kind === 'strength'),
          hardCardio: exercisesOn(today).some((e) => e.kind === 'cardio' && e.intensity === 'high'),
          any: exercisesOn(today).length > 0,
        },
        liftDays: liftDaysThisWeek(exercises, today),
        eatenTodayKcal: n.kcal,
        odd,
        spikeFoods,
        cgmDays: recentCgm.filter((d) => d.day >= shift(today, -6)).length,
        scans,
      }),
      plans: liftPlans(exercises, library, today),
      coverage,
      picks,
      spikeFoods,
      pace: weekPace(week),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, foods, exercises, activity, readings, cgmDays, targets, profile, custom, ketoModel, today, disliked])

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

      <GoalPlanCard plan={profile.goalPlan} targets={targets} weightUnit={weightUnit} onStart={(goalPlan) => onUpdateProfile({ goalPlan })} />

      <div className="grid two">
        {SECTIONS.map((s) => {
          // Tips already in Focus now aren't repeated below.
          const mine = tips.all.filter((t) => t.section === s.id && !top.includes(t))
          return (
            <div key={s.id} className="grid">
            <section className="card">
              <h2>{s.title}</h2>
              <p className="muted small" style={{ marginTop: 0 }}>{s.blurb}</p>
              {mine.map((t) => (
                <Tip key={t.id} t={t} />
              ))}
              {!mine.length && (
                <p className="muted small" style={{ margin: 0 }}>
                  {tips.all.some((t) => t.section === s.id) ? 'Covered in Focus now.' : 'Nothing to change here right now.'}
                </p>
              )}

              {s.id === 'training' && tips.plans.length > 0 && (
                <>
                  <div className="section-label">Next time, lift by lift</div>
                  {tips.plans.map((p) => (
                    <div key={p.name} className="coach-lift">
                      <div className="coach-tip-head">
                        <b>{p.name}</b>
                        <span className="muted small">
                          last{' '}
                          {p.last.measure === 'min'
                            ? `${p.last.duration ?? '?'} min${p.last.weight ? ` · level ${p.last.weight}` : ''}`
                            : p.last.measure === 's'
                              ? `${p.last.weight ? `${p.last.weight} ${p.last.unit} · ` : ''}${p.last.duration ?? '?'} s×${p.last.sets ?? '?'}`
                              : `${p.last.weight != null && p.last.weight > 0 ? `${p.last.weight} ${p.last.unit}${p.last.bells === 2 ? ' ×2' : ''} · ` : ''}${p.last.reps ?? '?'}×${p.last.sets ?? '?'}`}
                        </span>
                      </div>
                      <div className="muted small">
                        {p.text} <span className="coach-goal">{p.group === 'Cardio' ? goalLabel('vo2') : p.next.change === 'weight' ? goalLabel('strength') : goalLabel('muscle')}</span>
                      </div>
                    </div>
                  ))}
                  <p className="muted small" style={{ marginBottom: 0 }}>
                    Big lifts 6–10 reps, smaller and core 10–15: add reps to the top, then add weight and drop back down. Holds build to 60 s, then get harder.
                  </p>
                </>
              )}
              {s.id === 'training' && (
                <>
                  <div className="section-label">
                    Sets {new Date(`${shift(today, -6)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (last 7 days)
                  </div>
                  <WeeklySetsBars coverage={tips.coverage} />
                  {tips.picks.length > 0 && (
                    <>
                      <div className="section-label">Exercises for what's short</div>
                      {tips.picks.map(({ group, short, picks }) => (
                        <div key={group} className="coach-lift">
                          <div className="coach-tip-head">
                            <b>{group}</b>
                            <span className="muted small">{short} set{short === 1 ? '' : 's'} to go</span>
                          </div>
                          {picks.map((p) => (
                            <div key={p.name} className="coach-pick">
                              <span>
                                {p.name}
                                <span className="muted small">
                                  {p.times ? ` · done ${p.times}×, last ${new Date(`${p.lastDay}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : p.atYourGym ? ' · new, at your gym' : ' · new'}
                                </span>
                              </span>
                              <button type="button" className="link-btn small" onClick={() => onUpdateProfile({ dislikedLifts: [...disliked, p.name] })}>
                                Not for me
                              </button>
                            </div>
                          ))}
                          {!picks.length && <div className="muted small">Nothing left in the list for this group. Undo a "not for me" below, or log one of your own.</div>}
                        </div>
                      ))}
                    </>
                  )}
                  {disliked.length > 0 && (
                    <p className="muted small" style={{ marginBottom: 0 }}>
                      Not for you:{' '}
                      {disliked.map((d, i) => (
                        <span key={d}>
                          {i > 0 && ', '}
                          {d}{' '}
                          <button type="button" className="link-btn small" onClick={() => onUpdateProfile({ dislikedLifts: disliked.filter((x) => x !== d) })}>
                            undo
                          </button>
                        </span>
                      ))}
                    </p>
                  )}
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
            {s.id === 'nutrition' && <KetoModelCard model={ketoModel} netCarbLimit={targets.netCarbsG} onApplyLimit={onApplyLimit} />}
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
