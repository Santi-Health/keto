import { useMemo, useState } from 'react'
import { daysSinceStrength, routineDue, routineSession, sessionLabel, trainingWarnings } from '../lib/exercise'
import { getGoogleToken, learnTypes, listExercises, mergeImported, toAppExercise } from '../lib/googleHealth'
import { useInstall } from '../lib/install'
import { STATUS_TEXT, estimateKetosis, tomorrowMorning } from '../lib/ketosis'
import { AminoCard } from '../components/AminoCard'
import { DrinksCard } from '../components/DrinksCard'
import { ExerciseSheet } from '../components/ExerciseSheet'
import { TrainingCard } from '../components/TrainingCard'
import { InstallCard } from '../components/InstallCard'
import { ReadingSheet } from '../components/ReadingSheet'
import { ReadingsCard } from '../components/ReadingsCard'
import { Molecule } from '../components/Molecules'
import { Bar, Ring } from '../components/Progress'
import { WatchListCard } from '../components/WatchListCard'
import { useData } from '../lib/data'
import { addNutrients } from '../lib/nutrients'
import { liveFatBudget, localDate, type Targets } from '../lib/targets'
import type { Profile } from '../lib/types'
import { computeWatchList } from '../lib/watchlist'
import { ketoneBand, latest, type ReadingKind } from '../lib/readings'

interface Props {
  profile: Profile
  targets: Targets
  onOpenSettings: () => void
  onToggleRefeed: () => void
  onNavigate: (hash: string) => void
}

/** Offer installing on Today only when Chrome says it's possible, so it's not a permanent nag. */
function useInstallOffer() {
  return useInstall().state === 'available'
}

export function Today({ profile, targets, onOpenSettings, onToggleRefeed, onNavigate }: Props) {
  const { logsOn, logsWeekEnding, pending, syncError, exercises, exercisesOn, saveExercise, logs, readings } = useData()
  const [logExercise, setLogExercise] = useState(false)
  const [readingSheet, setReadingSheet] = useState<{ kind?: ReadingKind } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  /** Pulls the last 3 days of Fitbit workouts and merges them with what's logged. */
  async function importFitbit() {
    setImporting(true)
    setImportMessage(null)
    try {
      const token = await getGoogleToken()
      const from = new Date()
      from.setDate(from.getDate() - 2)
      const points = await listExercises(token, localDate(from), day)
      const mapped = points
        .map((p) => toAppExercise(p, profile.weightKg, targets.bmr, learnTypes(exercises)))
        .filter((x): x is NonNullable<typeof x> => !!x)
      const fromIso = new Date(`${localDate(from)}T00:00:00`).toISOString()
      const recent = exercises.filter((e) => e.started_at >= fromIso)
      const { added, updated, matched } = mergeImported(mapped, recent)
      for (const e of [...added, ...updated, ...matched]) saveExercise(e)
      const names = [...added, ...matched].map((e) => `${sessionLabel(e)} ${e.duration_min} min`)
      setImportMessage(
        points.length === 0
          ? 'No Fitbit workouts found in the last 3 days. If you just finished one, let the Fitbit app sync first.'
          : `Imported ${added.length} new, matched ${matched.length} you logged, refreshed ${updated.length}.${names.length ? ` ${names.join(' · ')}` : ''}`,
      )
    } catch (e) {
      setImportMessage(`Couldn't import: ${(e as Error).message}`)
    } finally {
      setImporting(false)
    }
  }
  const day = localDate()
  const dayLogs = logsOn(day)
  const weekLogs = logsWeekEnding(day)
  const n = useMemo(() => addNutrients(dayLogs.map((l) => l.nutrients)), [dayLogs])
  const totals = {
    netCarbs: n.netCarbs,
    protein: n.protein,
    fat: n.fat,
    calories: n.kcal,
    fiber: n.fiber,
    sodium: n.sodiumMg,
    potassium: n.potassiumMg,
    magnesium: n.magnesiumMg,
  }
  const watch = useMemo(
    () =>
      computeWatchList(
        dayLogs.map((l) => l.nutrients),
        weekLogs.map((l) => l.nutrients),
        { calorieTarget: targets.calories, weightKg: profile.weightKg },
        profile.watchList,
      ),
    [dayLogs, weekLogs, targets.calories, profile.weightKg, profile.watchList],
  )
  // Fat fills what's left: protein or carbs over plan shrink it, never below the minimum.
  const fatBudget = liveFatBudget(targets, { protein: totals.protein, netCarbs: totals.netCarbs })
  const sessionsToday = exercisesOn(day)
  const sinceStrength = daysSinceStrength(exercises)
  const trainWarnings = trainingWarnings({
    exercisesToday: sessionsToday,
    daysSinceStrength: sinceStrength,
    effectiveDeficit: targets.effectiveDeficit,
    isRefeed: targets.isRefeed,
  })
  const keto = estimateKetosis({ at: Date.now(), logs, exercises, netCarbLimit: targets.netCarbsG, proteinTarget: targets.proteinG })
  const ketoTomorrow = estimateKetosis({ at: tomorrowMorning(), logs, exercises, netCarbLimit: targets.netCarbsG, proteinTarget: targets.proteinG })
  // A blood reading from the last 3 hours beats the estimate.
  const lastKetone = latest(readings, 'blood_ketone')
  const measured = lastKetone?.value != null && Date.now() - Date.parse(lastKetone.taken_at) < 3 * 3_600_000 ? lastKetone : null
  const carbsLeft = targets.netCarbsG - totals.netCarbs
  const proteinLeft = targets.proteinG - totals.protein
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Today</h1>
          <div className="muted small">{date}</div>
        </div>
        {(pending > 0 || syncError) && (
          <span className={`badge ${syncError ? 'warn' : ''}`} title={syncError ?? undefined}>
            {syncError ? 'Sync problem' : `${pending} waiting to sync`}
          </span>
        )}
      </header>

      <div className="grid two">
        <div className="grid">
          {targets.warnings.length > 0 && (
            <button type="button" className="notice" onClick={onOpenSettings} style={{ border: 0, textAlign: 'left', cursor: 'pointer' }}>
              {targets.warnings.join(' ')} <u>Open settings</u>
            </button>
          )}

          <section className="card">
            <h2>Macros</h2>
            <div className="rings">
              <Ring label="Net carbs" value={totals.netCarbs} target={targets.netCarbsG} unit="g" color="var(--carbs)" isLimit molecule="glucose" />
              <Ring label="Protein" value={totals.protein} target={targets.proteinG} unit="g" color="var(--protein)" molecule="protein" />
              <Ring label="Fat" value={totals.fat} target={fatBudget} unit="g" color="var(--fat)" isLimit caption="Fat budget" molecule="fat" />
              <Ring label="Calories" value={totals.calories} target={targets.calories} unit="" color="var(--calories)" isLimit molecule="energy" />
            </div>
            {dayLogs.length > 0 && (
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
            {targets.fatMinG != null && (
              <p className="muted small" style={{ marginBottom: 0 }}>
                Fat isn't a goal: it fills the calories left after protein and carbs, so extra protein shrinks it. Aim
                for at least {targets.fatMinG} g (20% of calories).
                {dayLogs.length > 0 && fatBudget === targets.fatMinG && totals.protein > targets.proteinG && (
                  <> Protein is now using your fat room; you're at the minimum.</>
                )}
              </p>
            )}
            <p className="muted small">
              {targets.isRefeed
                ? `Refeed day: eat at maintenance (${targets.burn?.toLocaleString() ?? '?'} kcal), net carbs still under ${targets.netCarbsG} g.`
                : targets.capped
                  ? `Capped at your ${targets.calories?.toLocaleString()} kcal daily ceiling${targets.burn != null ? ` (estimated burn ${targets.burn.toLocaleString()} kcal).` : '.'}`
                  : targets.burnSource === 'fitbit'
                    ? `Calories based on ${targets.burn?.toLocaleString()} kcal burned (Fitbit).`
                    : targets.burn != null
                      ? `Calories based on an estimated ${targets.burn.toLocaleString()} kcal burn. Fitbit will replace this in phase 6.`
                      : 'Add your height in Settings to get a calorie target.'}
            </p>
            {targets.muscleWarning && (
              <p className="notice" role="status">
                <strong>Muscle check:</strong> {targets.muscleWarning}
              </p>
            )}
            <button type="button" className={`btn ${targets.isRefeed ? '' : 'secondary'}`} onClick={onToggleRefeed} aria-pressed={targets.isRefeed}>
              {targets.isRefeed ? 'Refeed day ✓ (tap to undo)' : 'Make today a refeed day'}
            </button>
          </section>

          <section className="card">
            <h2>Electrolytes &amp; fiber</h2>
            <Bar label="Sodium" value={totals.sodium} target={targets.sodiumMg} unit="mg" molecule="sodium" color="var(--atom-na)" />
            <Bar label="Potassium" value={totals.potassium} target={targets.potassiumMg} unit="mg" molecule="potassium" color="var(--atom-k)" />
            <Bar label="Magnesium" value={totals.magnesium} target={targets.magnesiumMg} unit="mg" molecule="magnesium" color="var(--atom-mg)" />
            <Bar label="Fiber" value={totals.fiber} target={targets.fiberG} unit="g" molecule="fiber" color="var(--fiber)" />
          </section>
        </div>

        <div className="grid">
          {useInstallOffer() && <InstallCard compact />}
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
              {['Label photo', 'Saved meal'].map((label) => (
                <button key={label} type="button" disabled title="Coming in a later phase">
                  {label}
                </button>
              ))}
            </div>
            <p className="muted small" style={{ marginBottom: 0 }}>The grayed-out buttons turn on in later phases.</p>
          </section>

          <DrinksCard waterTargetOz={profile.waterOz} />

          <ReadingsCard weightUnit={profile.weightUnit} onAdd={(kind) => setReadingSheet({ kind })} />

          <TrainingCard
            today={sessionsToday}
            daysSinceStrength={sinceStrength}
            warnings={trainWarnings}
            onLog={() => setLogExercise(true)}
            routine={profile.yogaRoutine && routineDue(profile.yogaRoutine, sessionsToday) ? profile.yogaRoutine : null}
            onLogRoutine={() => profile.yogaRoutine && saveExercise(routineSession(profile.yogaRoutine, profile.weightKg))}
            onImportFitbit={() => void importFitbit()}
            importing={importing}
            importMessage={importMessage}
          />

          <AminoCard logs={dayLogs} weightKg={profile.weightKg} goal={profile.muscleGoal} />

          <WatchListCard items={watch} />

          <section className="card">
            <div className="ketosis-head">
              <Molecule molecule="ketone" size={88} showFormula />
              <div>
                <h2 style={{ color: 'var(--ketone)' }}>Ketosis</h2>
                <div className="muted small">β-hydroxybutyrate: the ketone your blood meter reads</div>
              </div>
            </div>
            <div className={`keto-status ${keto.status}`}>
              <b>{STATUS_TEXT[keto.status]}</b>
              <span>
                Estimated blood ketones {keto.low}–{keto.high} mmol/L
              </span>
            </div>
            {measured && (
              <p className="small" style={{ margin: '0 0 6px' }}>
                <b>Measured {measured.value!.toFixed(1)} mmol/L</b> at{' '}
                {new Date(measured.taken_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}: {ketoneBand(measured.value!)}.
              </p>
            )}
            <ul className="keto-reasons">
              {keto.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="small" style={{ margin: '8px 0 0' }}>
              <b>Tomorrow 7 AM</b> if you don't eat more tonight: {STATUS_TEXT[ketoTomorrow.status].toLowerCase()} ({ketoTomorrow.low}–
              {ketoTomorrow.high} mmol/L).
              {keto.status === 'out' && ketoTomorrow.status === 'out' && ' Back under 25 g a day, it usually takes 1–3 days to return to ketosis.'}
            </p>
            <p className="muted small" style={{ marginBottom: 0 }}>
              Estimate from general research (carbs, fasting, exercise, protein). Ketosis means about 0.5+ mmol/L. Each blood ketone reading is
              saved next to what the estimate said; after about 10 readings it will start learning your own pattern.
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
      {logExercise && <ExerciseSheet weightKg={profile.weightKg} onClose={() => setLogExercise(false)} />}
    </>
  )
}
