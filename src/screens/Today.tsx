import { useMemo, useState, type ReactNode } from 'react'
import { daysSinceStrength, routineDue, routineSession, sessionLabel, trainingWarnings } from '../lib/exercise'
import { catchUpDays, mergeActivity, weightReadings } from '../lib/activity'
import { DRIVE_SCOPE, cachedToken, fetchActivity, getGoogleToken, heartRateCalories, learnTypes, listExercises, mergeImported, toAppExercise } from '../lib/googleHealth'
import { useInstall } from '../lib/install'
import { STATUS_TEXT, estimateKetosis, tomorrowMorning } from '../lib/ketosis'
import { AminoCard } from '../components/AminoCard'
import { ActivityCard, MorningReadiness, useMorningReadiness } from '../components/ActivityCard'
import { RelinkBanner } from '../components/BackgroundSyncCard'
import { AreaDetail, Tap } from '../components/AreaDetail'
import { VitaminsCard } from '../components/VitaminsCard'
import { useOpenSyncState } from '../lib/backgroundSync'
import { deviceTz, travelDay, zoneLabel } from '../lib/time'
import { DrinksCard } from '../components/DrinksCard'
import { ExerciseSheet } from '../components/ExerciseSheet'
import { TrainingCard } from '../components/TrainingCard'
import { InstallCard } from '../components/InstallCard'
import { ReadingSheet } from '../components/ReadingSheet'
import { ReadingsCard } from '../components/ReadingsCard'
import { Molecule } from '../components/Molecules'
import { Bar, Ring } from '../components/Progress'
import { DeficitNow } from '../components/DeficitNow'
import { WatchListCard } from '../components/WatchListCard'
import { useData } from '../lib/data'
import { addNutrients, type NutrientKey, type Nutrients } from '../lib/nutrients'
import { liveFatBudget, localDate, type Targets } from '../lib/targets'
import type { Profile } from '../lib/types'
import { AREAS, type Area, type AreaView } from '../lib/areas'
import { suggestFixes } from '../lib/suggest'
import { computeWatchList } from '../lib/watchlist'
import { KG_PER_LB, ketoneBand, latest, type ReadingKind } from '../lib/readings'
import { useKetoModel } from '../lib/useKetoModel'
import { useBackup } from '../lib/useBackup'
import { backupDue } from '../lib/driveBackup'
import { READINESS_TEXT, readinessFor } from '../lib/readiness'
import { dailySeries, lastDays } from '../lib/trends'
import { formatSleep } from '../lib/activity'

type View = 'today' | 'yesterday' | 'week'
const VIEWS: { value: View; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'Last 7 days' },
]

interface Props {
  profile: Profile
  targets: Targets
  onOpenSettings: () => void
  onToggleRefeed: () => void
  onNavigate: (hash: string) => void
  onUpdateProfile: (changes: Partial<Profile>) => void
}

/** Offer installing on Today only when Chrome says it's possible, so it's not a permanent nag. */
function useInstallOffer() {
  return useInstall().state === 'available'
}

export function Today({ profile, targets, onOpenSettings, onToggleRefeed, onNavigate, onUpdateProfile }: Props) {
  const { logsOn, logsWeekEnding, pending, syncError, exercises, exercisesOn, saveExercise, logs, foods, readings, activity, saveActivity, saveReading, cgmDays } = useData()
  const [view, setView] = useState<View>('today')
  const openSync = useOpenSyncState()
  const backup = useBackup(profile, onUpdateProfile)
  const hasData = logs.length > 0 || readings.length > 0
  const [weekMode, setWeekMode] = useState<'average' | 'total'>('average')
  const [logExercise, setLogExercise] = useState(false)
  const [readingSheet, setReadingSheet] = useState<{ kind?: ReadingKind } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  const hrProfile = { age: targets.age, sex: profile.sex, bmrPerDay: targets.bmr }

  /** Pulls the last 3 days of Fitbit workouts and merges them with what's logged. */
  async function importFitbit() {
    setImporting(true)
    setImportMessage(null)
    try {
      const token = await getGoogleToken()
      // Workouts since the last Fitbit one already here (at least 3 days), so time away gets filled in.
      const lastWorkout = exercises.filter((e) => e.source === 'fitbit').map((e) => localDate(new Date(e.started_at))).sort().pop() ?? null
      const from = new Date()
      from.setDate(from.getDate() - (catchUpDays(lastWorkout, today, { min: 3, first: 14 }) - 1))
      const points = await listExercises(token, localDate(from), today)
      const mapped = points
        .map((p) => toAppExercise(p, profile.weightKg, targets.bmr, learnTypes(exercises)))
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map((x) => ({ ...x, meta: { ...x.meta, tz: deviceTz() } }))
      const fromIso = new Date(`${localDate(from)}T00:00:00`).toISOString()
      const recent = exercises.filter((e) => e.started_at >= fromIso)
      const { added, updated, matched } = mergeImported(mapped, recent)
      for (const e of [...added, ...updated, ...matched]) saveExercise(e)
      const names = [...added, ...matched].map((e) => `${sessionLabel(e)} ${e.duration_min} min`)

      // Hand-logged sessions still on an estimate get their calories from heart rate during the session.
      const touched = new Set([...added, ...updated, ...matched].map((e) => e.id))
      const estimated = recent.filter((e) => e.source === 'manual' && e.meta.caloriesEstimated && !touched.has(e.id))
      let hrUpdated = 0
      for (const e of estimated) {
        try {
          const r = await heartRateCalories(token, new Date(e.started_at), e.duration_min, { ...hrProfile, weightKg: profile.weightKg })
          if (!r) continue
          saveExercise({ ...e, calories: r.kcal, meta: { ...e.meta, caloriesEstimated: false, caloriesSource: 'heart-rate', avgHr: r.avgHr, hrSamples: r.samples } })
          hrUpdated++
        } catch {
          // Leave the estimate; the session can still be updated from its edit screen.
        }
      }

      // Steps, calories burned, resting heart rate, sleep and weigh-ins: 30 days the first time, then the last week.
      const actFrom = new Date()
      // A month the first time (and once more to backfill HRV for readiness), then everything since the last import.
      const hasHistory = Object.values(activity).some((d) => d.meta.hrvMs != null)
      const lastDay = hasHistory ? Object.values(activity).filter((d) => d.steps != null).map((d) => d.day).sort().pop() ?? null : null
      actFrom.setDate(actFrom.getDate() - (catchUpDays(lastDay, today, { min: 7, first: 30 }) - 1))
      // Workouts are already saved; a problem here is reported without losing them.
      let actMessage: string
      try {
        const act = await fetchActivity(token, localDate(actFrom), today)
        const changedDays = mergeActivity(act, activity)
        for (const d of changedDays) saveActivity(d)
        const weighIns = await weightReadings(act, readings)
        for (const w of weighIns) saveReading(w)
        actMessage = [
          `Activity: ${changedDays.length} day${changedDays.length === 1 ? '' : 's'} updated${weighIns.length ? `, ${weighIns.length} weigh-in${weighIns.length > 1 ? 's' : ''}` : ''}.`,
          act.skipped.length ? `Not allowed yet: ${act.skipped.join(', ')}. Tap Import again and allow them.` : '',
        ].join(' ')
      } catch (e) {
        actMessage = `Couldn't read steps/sleep: ${(e as Error).message}`
      }

      // The weekly Drive backup rides along when Drive was already approved this session (no popup);
      // otherwise the reminder on Today offers it with one tap.
      let backupMessage = ''
      const driveToken = cachedToken(DRIVE_SCOPE)
      if (backupDue(profile.lastBackupAt) && driveToken) {
        try {
          backupMessage = await backup.backUp(driveToken)
        } catch (e) {
          backupMessage = (e as Error).message
        }
      }

      setImportMessage(
        [
          points.length === 0
            ? 'No Fitbit workouts in the last 3 days.'
            : `Workouts: ${added.length} new, ${matched.length} matched, ${updated.length} refreshed.${names.length ? ` ${names.join(' · ')}` : ''}`,
          hrUpdated ? `${hrUpdated} hand-logged workout${hrUpdated > 1 ? 's' : ''} now use${hrUpdated > 1 ? '' : 's'} your heart rate for calories.` : '',
          actMessage,
          backupMessage,
        ]
          .filter(Boolean)
          .join(' '),
      )
    } catch (e) {
      setImportMessage(`Couldn't import: ${(e as Error).message}`)
    } finally {
      setImporting(false)
    }
  }
  const today = localDate()
  const yesterday = lastDays(2, today)[0]
  const isToday = view === 'today'
  const isWeek = view === 'week'
  // The week is the 7 full days before today, so a half-eaten today doesn't drag the averages down.
  const viewDays = useMemo(() => (view === 'today' ? [today] : view === 'yesterday' ? [yesterday] : lastDays(7, yesterday)), [view, today, yesterday])
  const day = viewDays[viewDays.length - 1]
  const travelDays = useMemo(
    () => viewDays.map((d) => ({ day: d, t: travelDay(d, profile.zoneLog) })).filter((x): x is { day: string; t: NonNullable<ReturnType<typeof travelDay>> } => !!x.t),
    [viewDays, profile.zoneLog],
  )
  const dayLogs = viewDays.flatMap((d) => logsOn(d))
  const loggedDays = Math.max(1, viewDays.filter((d) => logsOn(d).length > 0).length)
  const weekLogs = logsWeekEnding(day)
  // On the week view every number is a per-day average over the days with food logged.
  const n = useMemo(() => {
    const sum = addNutrients(dayLogs.map((l) => l.nutrients))
    if (!isWeek) return sum
    const avg = { ...sum }
    for (const k of Object.keys(avg) as NutrientKey[]) avg[k] = sum[k] / loggedDays
    return avg
  }, [dayLogs, isWeek, loggedDays])
  // Week totals compare the sum with the daily targets × the days with food logged.
  const showTotals = isWeek && weekMode === 'total'
  const mult = showTotals ? loggedDays : 1
  const totals = {
    netCarbs: n.netCarbs * mult,
    protein: n.protein * mult,
    fat: n.fat * mult,
    calories: n.kcal * mult,
    fiber: n.fiber * mult,
    sodium: n.sodiumMg * mult,
    potassium: n.potassiumMg * mult,
    magnesium: n.magnesiumMg * mult,
  }
  const t = (x: number | null) => (x == null ? x : x * mult)
  const watch = useMemo(
    () =>
      computeWatchList(
        isWeek ? [n as Nutrients] : dayLogs.map((l) => l.nutrients),
        weekLogs.map((l) => l.nutrients),
        { calorieTarget: targets.calories, weightKg: profile.weightKg },
        profile.watchList,
      ),
    [dayLogs, weekLogs, isWeek, n, targets.calories, profile.weightKg, profile.watchList],
  )
  // Fat fills what's left: protein or carbs over plan shrink it, never below the minimum.
  const dailyFat = liveFatBudget(targets, { protein: n.protein, netCarbs: n.netCarbs })
  const fatBudget = dailyFat == null ? null : dailyFat * mult
  const sessionsToday = viewDays.flatMap((d) => exercisesOn(d))
  const sinceStrength = daysSinceStrength(exercises)
  const readiness = isToday ? readinessFor(today, activity) : null
  const [morning, doneMorning] = useMorningReadiness()
  const suggestWatch = useMemo(
    () => ({ ctx: { calorieTarget: targets.calories, weightKg: profile.weightKg }, settings: profile.watchList, weekItems: weekLogs.filter((l) => !dayLogs.includes(l)).map((l) => l.nutrients) }),
    [targets.calories, profile.weightKg, profile.watchList, weekLogs, dayLogs],
  )
  const tips = useMemo(
    () => (isWeek ? [] : suggestFixes({ dayLogs, history: logs, foods, targets, muscleGoal: profile.muscleGoal, fatBudget, past: !isToday, sex: profile.sex, watch: suggestWatch })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, logs, foods, targets, profile.muscleGoal, fatBudget, profile.sex, suggestWatch],
  )
  const areaView: AreaView = { logs: dayLogs, weekLogs, history: logs, foods, days: viewDays, isToday, isWeek, tips, sex: profile.sex, age: targets.age, netCarbLimit: targets.netCarbsG }
  const [openArea, setOpenArea] = useState<string | null>(null)
  const potassiumArea = { ...AREAS.potassium, target: targets.potassiumMg }
  const magnesiumArea = { ...AREAS.magnesium, target: targets.magnesiumMg }
  const fiberArea = { ...AREAS.fiber, target: targets.fiberG }
  const tap = (area: Area, child: ReactNode) => (
    <Tap area={area} view={areaView} open={openArea === area.id} onToggle={() => setOpenArea(openArea === area.id ? null : area.id)}>
      {child}
    </Tap>
  )
  const detail = (...areas: Area[]) => areas.map((a) => openArea === a.id && <AreaDetail key={a.id} area={a} view={areaView} />)
  const trainWarnings = !isToday ? [] : [...(readiness?.band === 'low' ? [{ level: 'yellow' as const, text: `Readiness is ${readiness.score}: ${READINESS_TEXT.low}` }] : []), ...trainingWarnings({
    exercisesToday: sessionsToday,
    daysSinceStrength: sinceStrength,
    effectiveDeficit: targets.effectiveDeficit,
    isRefeed: targets.isRefeed,
  })]
  const ketoModel = useKetoModel(targets.netCarbsG, targets.proteinG)
  const ketoOpts = { logs, exercises, netCarbLimit: targets.netCarbsG, proteinTarget: targets.proteinG, model: ketoModel.adjuster }
  // Past days are judged at the end of the day (11:59 PM).
  const endOf = (d: string) => new Date(`${d}T23:59:00`).getTime()
  const keto = estimateKetosis({ ...ketoOpts, at: isToday ? Date.now() : endOf(day) })
  const ketoTomorrow = estimateKetosis({ ...ketoOpts, at: tomorrowMorning() })
  const weekKeto = isWeek ? viewDays.map((d) => ({ day: d, e: estimateKetosis({ ...ketoOpts, at: endOf(d) }) })) : []
  // A blood reading from the last 3 hours beats the estimate.
  const lastKetone = latest(readings, 'blood_ketone')
  const measured = isToday && lastKetone?.value != null && Date.now() - Date.parse(lastKetone.taken_at) < 3 * 3_600_000 ? lastKetone : null
  const past = useMemo(
    () => (isToday ? [] : dailySeries({ days: viewDays, logs, readings, exercises, activity, cgmDays })),
    [isToday, viewDays, logs, readings, exercises, activity, cgmDays],
  )
  const showDeficit = isToday && targets.bmr != null
  const carbsLeft = targets.netCarbsG * mult - totals.netCarbs
  const proteinLeft = targets.proteinG - totals.protein
  const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', opts)
  const date = isWeek
    ? `${fmtDay(viewDays[0], { month: 'short', day: 'numeric' })} – ${fmtDay(day, { month: 'short', day: 'numeric' })} · ${showTotals ? `totals vs. targets × ${loggedDays} days` : 'averages per day'} (${loggedDays} with food logged)`
    : fmtDay(day, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{isToday ? 'Today' : isWeek ? 'Last 7 days' : 'Yesterday'}</h1>
          <div className="muted small">{date}</div>
        </div>
        {openSync.running && <span className="badge">Updating from Fitbit…</span>}
        {!openSync.running && (pending > 0 || syncError) && (
          <span className={`badge ${syncError ? 'warn' : ''}`} title={syncError ?? undefined}>
            {syncError ? 'Sync problem' : `${pending} waiting to sync`}
          </span>
        )}
      </header>
      <div className="segmented day-switch" role="group" aria-label="Which day">
        {VIEWS.map((v) => (
          <button key={v.value} type="button" aria-pressed={view === v.value} onClick={() => setView(v.value)}>
            {v.label}
          </button>
        ))}
      </div>

      {isWeek && (
        <div className="segmented week-mode" role="group" aria-label="Show the week as">
          <button type="button" aria-pressed={weekMode === 'average'} onClick={() => setWeekMode('average')}>
            Daily average
          </button>
          <button type="button" aria-pressed={weekMode === 'total'} onClick={() => setWeekMode('total')}>
            Week total
          </button>
        </div>
      )}

      <div className="grid two">
        <div className="grid">
          {isToday && <RelinkBanner />}
          {isToday && morning && <MorningReadiness onDone={doneMorning} />}
          {travelDays.map(({ day: d, t }) => {
            const pct = Math.round((t.hours / 24 - 1) * 100)
            return (
              <div key={d} className="notice small travel-note" role="status">
                ✈︎ <b>Travel day</b>: {isWeek ? `${fmtDay(d, { weekday: 'short', month: 'short', day: 'numeric' })} was` : isToday ? 'today is' : 'yesterday was'}{' '}
                <b>{t.hours} hours</b> long ({zoneLabel(t.from)} → {zoneLabel(t.to)}). Targets stay daily, so totals
                {Math.abs(pct) >= 3 ? ` may run about ${Math.abs(pct)}% ${pct > 0 ? 'high' : 'low'}` : ' are about normal'}; your body runs on hours awake, not the
                calendar.
              </div>
            )
          })}
          {isToday && hasData && backupDue(profile.lastBackupAt) && (
            <div className="notice small" role="status">
              {profile.lastBackupAt
                ? `Time for your weekly Google Drive backup (last ${new Date(profile.lastBackupAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}).`
                : 'Back up your data to Google Drive once a week (Google asks once to allow it).'}{' '}
              <button type="button" className="link-btn" disabled={backup.busy} onClick={() => void backup.backUp().catch(() => {})}>
                {backup.busy ? 'Backing up…' : 'Back up now'}
              </button>
              {backup.message && <div>{backup.message}</div>}
            </div>
          )}
          {isToday && targets.warnings.length > 0 && (
            <button type="button" className="notice" onClick={onOpenSettings} style={{ border: 0, textAlign: 'left', cursor: 'pointer' }}>
              {targets.warnings.join(' ')} <u>Open settings</u>
            </button>
          )}

          <div className="grid">
          {showDeficit && (
            <DeficitNow
              calorieLimit={targets.calories}
              onOpenLog={(focus) => onNavigate(`log/${today}/${focus}`)}
              day={today}
              bmr={targets.bmr!}
              logs={dayLogs}
              exercises={sessionsToday}
              activity={Object.values(activity).find((a) => a.day === today && !a.deleted_at) ?? null}
              // The deficit you asked for; the calorie ceiling can make the real one bigger, never smaller.
              goal={targets.isRefeed ? null : profile.deficitKcal}
            />
          )}
          <section className="card">
            <h2>Macros</h2>
            <div className="rings" style={showDeficit ? { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } : undefined}>
              {tap(AREAS.netCarbs, <Ring label="Net carbs" value={totals.netCarbs} target={targets.netCarbsG * mult} unit="g" color="var(--carbs)" isLimit molecule="glucose" />)}
              {tap(AREAS.protein, <Ring label="Protein" value={totals.protein} target={targets.proteinG * mult} unit="g" color="var(--protein)" molecule="protein" />)}
              {tap(AREAS.fat, <Ring label="Fat" value={totals.fat} target={fatBudget} unit="g" color="var(--fat)" isLimit caption="Fat budget" molecule="fat" />)}
              {/* Today's calories live in the summary card above. */}
              {!showDeficit && tap(AREAS.kcal, <Ring label="Calories" value={totals.calories} target={t(targets.calories)} unit="" color="var(--calories)" isLimit molecule="energy" />)}
            </div>
            {dayLogs.length > 0 && (
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                Tap anything to see the foods behind it, your usual and what to change. A green dot marks the top suggestions for today.
                {showDeficit && (
                  <>
                    {' '}
                    <button type="button" className="link" style={{ margin: 0 }} aria-expanded={openArea === AREAS.kcal.id} onClick={() => setOpenArea(openArea === AREAS.kcal.id ? null : AREAS.kcal.id)}>
                      Calories ›
                    </button>
                  </>
                )}
              </p>
            )}
            {detail(AREAS.netCarbs, AREAS.protein, AREAS.fat, AREAS.kcal)}
            {!isToday && (
              <p className="small" style={{ marginBottom: 0 }}>
                {dayLogs.length === 0 ? (
                  'No food logged.'
                ) : (
                  <>
                    {isWeek ? (showTotals ? 'Total ' : 'Average ') : ''}
                    <strong style={carbsLeft < 0 ? { color: 'var(--warn)' } : undefined}>{totals.netCarbs.toFixed(1)} g</strong> net carbs (limit{' '}
                    {targets.netCarbsG * mult} g) · <strong>{Math.round(totals.protein)} g</strong> protein (target {targets.proteinG * mult} g) ·{' '}
                    <strong>{Math.round(totals.calories).toLocaleString()}</strong> kcal
                    {isWeek && ` · ${past.filter((p) => p.logged && p.netCarbs <= targets.netCarbsG).length} of ${loggedDays} days under the carb limit`}
                  </>
                )}
              </p>
            )}
            {isToday && dayLogs.length > 0 && (
              <p className="small" style={{ marginBottom: 0 }}>
                {carbsLeft >= 0 ? (
                  <>
                    <strong>{carbsLeft.toFixed(1)} g</strong> net carbs left
                  </>
                ) : (
                  <strong style={{ color: 'var(--warn)' }}>{(-carbsLeft).toFixed(1)} g over your net carb limit</strong>
                )}
                {' · '}
                {proteinLeft > 0 ? (
                  <>
                    <strong>{Math.round(proteinLeft)} g</strong> protein to go
                  </>
                ) : (
                  'protein target reached ✓'
                )}
                {fatBudget != null && (
                  <>
                    {' · '}
                    <strong>{Math.max(0, Math.round(fatBudget - totals.fat))} g</strong> fat room left
                  </>
                )}
              </p>
            )}
            {isToday && targets.fatMinG != null && (
              <p className="muted small" style={{ marginBottom: 0 }}>
                Fat isn't a goal: it fills the calories left after protein and carbs, so extra protein shrinks it. Aim
                for at least {targets.fatMinG} g (20% of calories).
                {dayLogs.length > 0 && fatBudget === targets.fatMinG && totals.protein > targets.proteinG && (
                  <> Protein is now using your fat room; you're at the minimum.</>
                )}
              </p>
            )}
            {isToday && (
            <p className="muted small">
              {targets.isRefeed
                ? `Refeed day: eat at maintenance (${targets.burn?.toLocaleString() ?? '?'} kcal), net carbs still under ${targets.netCarbsG} g.`
                : targets.capped
                  ? `Capped at your ${targets.calories?.toLocaleString()} kcal daily ceiling${targets.burn != null ? ` (${targets.burnSource === 'fitbit' ? 'Fitbit 7-day burn' : 'estimated burn'} ${targets.burn.toLocaleString()} kcal).` : '.'}`
                  : targets.burnSource === 'fitbit'
                    ? `Calories based on your Fitbit burn: ${targets.burn?.toLocaleString()} kcal a day (average of the last ${profile.fitbitBurnDays ?? 7} full days).`
                    : targets.burn != null
                      ? `Calories based on an estimated ${targets.burn.toLocaleString()} kcal burn. Import from Fitbit to use your real burn.`
                      : 'Add your height in Settings to get a calorie target.'}
            </p>
            )}
            {isToday && targets.muscleWarning && (
              <p className="notice" role="status">
                <strong>Muscle check:</strong> {targets.muscleWarning}
              </p>
            )}
            {isToday && (
              <button type="button" className={`btn ${targets.isRefeed ? '' : 'secondary'}`} onClick={onToggleRefeed} aria-pressed={targets.isRefeed}>
                {targets.isRefeed ? 'Refeed day ✓ (tap to undo)' : 'Make today a refeed day'}
              </button>
            )}
          </section>

          {/* First until something is logged (the morning mate cocido), then the macros lead. Moved with order so its Undo survives. */}
          <div style={{ order: isToday && dayLogs.length === 0 ? -1 : 0 }}>
            <DrinksCard days={viewDays} waterTargetOz={profile.waterOz} />
          </div>
          </div>

          <section className="card">
            <h2>Electrolytes &amp; fiber</h2>
            {tap(AREAS.sodium, <Bar label="Sodium" value={totals.sodium} target={targets.sodiumMg * mult} unit="mg" molecule="sodium" color="var(--atom-na)" />)}
            {detail(AREAS.sodium)}
            {tap(potassiumArea, <Bar label="Potassium" value={totals.potassium} target={targets.potassiumMg * mult} unit="mg" molecule="potassium" color="var(--atom-k)" />)}
            {detail(potassiumArea)}
            {tap(magnesiumArea, <Bar label="Magnesium" value={totals.magnesium} target={targets.magnesiumMg * mult} unit="mg" molecule="magnesium" color="var(--atom-mg)" />)}
            {detail(magnesiumArea)}
            {tap(fiberArea, <Bar label="Fiber" value={totals.fiber} target={targets.fiberG * mult} unit="g" molecule="fiber" color="var(--fiber)" />)}
            {detail(fiberArea)}
          </section>

          <VitaminsCard total={n as Nutrients} items={dayLogs.map((l) => l.nutrients)} sex={profile.sex} age={targets.age} week={isWeek} view={areaView} />
        </div>

        <div className="grid">
          {useInstallOffer() && isToday && <InstallCard compact />}
          {isToday && (
          <section className="card">
            <h2>Quick add</h2>
            <div className="quick">
              <button type="button" style={{ color: 'var(--text)' }} onClick={() => onNavigate('add')}>
                Search food
              </button>
              <button type="button" style={{ color: 'var(--text)' }} onClick={() => onNavigate('add/scan')}>
                Scan barcode
              </button>
              <button type="button" style={{ color: 'var(--text)' }} onClick={() => setLogExercise(true)}>
                Exercise
              </button>
              <button type="button" style={{ color: 'var(--text)' }} onClick={() => setReadingSheet({})}>
                Reading
              </button>
              <button type="button" style={{ color: 'var(--text)' }} onClick={() => onNavigate('add/claude')}>
                Label photo
              </button>
              <button type="button" style={{ color: 'var(--text)' }} onClick={() => onNavigate('add')}>
                Saved meal
              </button>
            </div>
          </section>
          )}

          <ActivityCard days={viewDays} onImport={() => void importFitbit()} importing={importing} hideReadiness={isToday && morning} />

          {isToday ? (
            <ReadingsCard weightUnit={profile.weightUnit} onAdd={(kind) => setReadingSheet({ kind })} />
          ) : (
            <PastReadings points={past} weightUnit={profile.weightUnit} week={isWeek} />
          )}

          <TrainingCard
            today={sessionsToday}
            daysSinceStrength={sinceStrength}
            warnings={trainWarnings}
            onLog={() => setLogExercise(true)}
            period={isToday ? 'today' : isWeek ? 'in these 7 days' : 'yesterday'}
            routine={isToday && profile.yogaRoutine && routineDue(profile.yogaRoutine, sessionsToday) ? profile.yogaRoutine : null}
            onLogRoutine={() => profile.yogaRoutine && saveExercise(routineSession(profile.yogaRoutine, profile.weightKg))}
            onImportFitbit={() => void importFitbit()}
            importing={importing}
            importMessage={importMessage}
          />

          {!isWeek && <AminoCard logs={dayLogs} weightKg={profile.weightKg} goal={profile.muscleGoal} />}

          <WatchListCard items={watch} view={areaView} period={isToday ? 'today' : isWeek ? 'on an average day' : 'yesterday'} />

          <section className="card">
            <div className="ketosis-head">
              <Molecule molecule="ketone" size={88} showFormula />
              <div>
                <h2 style={{ color: 'var(--ketone)' }}>Ketosis</h2>
                <div className="muted small">β-hydroxybutyrate: the ketone your blood meter reads</div>
              </div>
            </div>
            {isWeek ? (
              <div className="keto-week">
                {weekKeto.map(({ day: d, e }) => (
                  <div key={d} className={`keto-day ${e.status}`} title={`${STATUS_TEXT[e.status]} (${e.low}–${e.high} mmol/L)`}>
                    <b>{fmtDay(d, { weekday: 'narrow' })}</b>
                    <span>{e.mid.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            ) : (
            <div className={`keto-status ${keto.status}`}>
              <b>{isToday ? '' : 'By the end of yesterday: '}{STATUS_TEXT[keto.status]}</b>
              <span>
                Estimated blood ketones {keto.low}–{keto.high} mmol/L
              </span>
            </div>
            )}
            {isWeek && (
              <p className="small" style={{ margin: '0 0 6px' }}>
                Estimated in ketosis (0.5+ mmol/L) on <b>{weekKeto.filter((k) => k.e.mid >= 0.5).length} of 7</b> days, judged at the end of each day.
                {past.some((p) => p.ketones != null) &&
                  ` Your blood readings averaged ${(past.filter((p) => p.ketones != null).reduce((s2, p) => s2 + p.ketones!, 0) / past.filter((p) => p.ketones != null).length).toFixed(1)} mmol/L.`}
              </p>
            )}
            {view === 'yesterday' && past[0]?.ketones != null && (
              <p className="small" style={{ margin: '0 0 6px' }}>
                <b>Measured {past[0].ketones.toFixed(1)} mmol/L</b> (average of yesterday's readings): {ketoneBand(past[0].ketones)}.
              </p>
            )}
            {measured && (
              <p className="small" style={{ margin: '0 0 6px' }}>
                <b>Measured {measured.value!.toFixed(1)} mmol/L</b> at{' '}
                {new Date(measured.taken_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}: {ketoneBand(measured.value!)}.
              </p>
            )}
            {!isWeek && (
            <ul className="keto-reasons">
              {keto.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            )}
            {isToday && (
            <p className="small" style={{ margin: '8px 0 0' }}>
              <b>Tomorrow 7 AM</b> if you don't eat more tonight: {STATUS_TEXT[ketoTomorrow.status].toLowerCase()} ({ketoTomorrow.low}–
              {ketoTomorrow.high} mmol/L).
              {keto.status === 'out' && ketoTomorrow.status === 'out' && ' Back under 25 g a day, it usually takes 1–3 days to return to ketosis.'}
            </p>
            )}
            <p className="muted small" style={{ marginBottom: 0 }}>
              {ketoModel.n === 0
                ? 'Estimate from general research (carbs, fasting, exercise, protein). Ketosis means about 0.5+ mmol/L. Add blood ketone readings and it learns your own pattern.'
                : `Personal model from ${ketoModel.n} blood reading${ketoModel.n > 1 ? 's' : ''} (${ketoModel.confidence === 'solid' ? 'solid' : 'still learning'}). Ketosis means about 0.5+ mmol/L. `}
              {ketoModel.n > 0 && (
                <button type="button" className="link-btn" onClick={() => onNavigate('insights')}>
                  See how it's doing
                </button>
              )}
            </p>
          </section>
        </div>
      </div>
      {readingSheet && (
        <ReadingSheet
          weightUnit={profile.weightUnit}
          netCarbLimit={targets.netCarbsG}
          proteinTarget={targets.proteinG}
          kind={readingSheet.kind}
          onClose={() => setReadingSheet(null)}
        />
      )}
      {logExercise && <ExerciseSheet weightKg={profile.weightKg} hr={hrProfile} onClose={() => setLogExercise(false)} />}
    </>
  )
}

/** Readings for a past day or week: ketones, glucose, weight, sleep. */
function PastReadings({ points, weightUnit, week }: { points: ReturnType<typeof dailySeries>; weightUnit: Profile['weightUnit']; week: boolean }) {
  const avg = (get: (p: (typeof points)[number]) => number | null) => {
    const xs = points.map(get).filter((x): x is number => x != null)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  }
  const weights = points.filter((p) => p.weightKg != null)
  const w = (kg: number) => (weightUnit === 'lb' ? kg / KG_PER_LB : kg).toFixed(1)
  const ketones = avg((p) => p.ketones)
  const glucose = avg((p) => p.glucoseAvg)
  const overnight = avg((p) => p.glucoseOvernight)
  const fasting = avg((p) => p.fastingGlucose)
  const sleep = avg((p) => p.sleepMin)
  const label = week ? 'avg' : ''
  return (
    <section className="card">
      <h2>Readings</h2>
      <div className="stat-grid two-col">
        <div>
          <b style={{ color: 'var(--ketone)' }}>{ketones != null ? ketones.toFixed(1) : '—'}</b>
          <span>Ketones mmol/L {label}</span>
        </div>
        <div>
          <b>{glucose != null ? Math.round(glucose) : '—'}</b>
          <span>
            CGM glucose {label}
            {overnight != null ? ` · 3–6 AM ${Math.round(overnight)}` : ''}
          </span>
        </div>
        <div>
          <b>{fasting != null ? Math.round(fasting) : '—'}</b>
          <span>Fasting finger-stick {label}</span>
        </div>
        <div>
          <b>{weights.length ? w(weights[weights.length - 1].weightKg!) : '—'}</b>
          <span>
            {weightUnit}
            {week && weights.length > 1 ? ` · ${(Number(w(weights[weights.length - 1].weightKg!)) - Number(w(weights[0].weightKg!))).toFixed(1)} over the week` : ''}
          </span>
        </div>
      </div>
      {sleep != null && <p className="muted small" style={{ margin: '6px 0 0' }}>Sleep {week ? 'average' : ''} {formatSleep(sleep)}.</p>}
    </section>
  )
}
