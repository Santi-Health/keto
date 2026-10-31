import { useMemo } from 'react'
import { Bar, Ring } from '../components/Progress'
import { WatchListCard } from '../components/WatchListCard'
import { useData } from '../lib/data'
import { addNutrients } from '../lib/nutrients'
import { localDate, type Targets } from '../lib/targets'
import type { Profile } from '../lib/types'
import { computeWatchList } from '../lib/watchlist'

interface Props {
  profile: Profile
  targets: Targets
  onOpenSettings: () => void
  onToggleRefeed: () => void
  onNavigate: (hash: string) => void
}

export function Today({ profile, targets, onOpenSettings, onToggleRefeed, onNavigate }: Props) {
  const { logsOn, logsWeekEnding, pending, syncError } = useData()
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
              <Ring label="Net carbs" value={totals.netCarbs} target={targets.netCarbsG} unit="g" color="var(--carbs)" isLimit />
              <Ring label="Protein" value={totals.protein} target={targets.proteinG} unit="g" color="var(--protein)" />
              <Ring label="Fat" value={totals.fat} target={targets.fatG} unit="g" color="var(--fat)" />
              <Ring label="Calories" value={totals.calories} target={targets.calories} unit="" color="var(--calories)" isLimit />
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
            <Bar label="Sodium" value={totals.sodium} target={targets.sodiumMg} unit="mg" />
            <Bar label="Potassium" value={totals.potassium} target={targets.potassiumMg} unit="mg" />
            <Bar label="Magnesium" value={totals.magnesium} target={targets.magnesiumMg} unit="mg" />
            <Bar label="Fiber" value={totals.fiber} target={targets.fiberG} unit="g" />
          </section>
        </div>

        <div className="grid">
          <section className="card">
            <h2>Quick add</h2>
            <div className="quick">
              <button type="button" style={{ color: 'var(--text)' }} onClick={() => onNavigate('add')}>
                Search food
              </button>
              <button type="button" style={{ color: 'var(--text)' }} onClick={() => onNavigate('add/scan')}>
                Scan barcode
              </button>
              {['Label photo', 'Saved meal', 'Reading', 'Exercise'].map((label) => (
                <button key={label} type="button" disabled title="Coming in a later phase">
                  {label}
                </button>
              ))}
            </div>
            <p className="muted small" style={{ marginBottom: 0 }}>The grayed-out buttons turn on in later phases.</p>
          </section>

          <WatchListCard items={watch} />

          <section className="card">
            <h2>Ketosis</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {totals.netCarbs <= targets.netCarbsG
                ? `Today's net carbs (${totals.netCarbs.toFixed(1)} g) are within your ${targets.netCarbsG} g limit.`
                : `Today's net carbs (${totals.netCarbs.toFixed(1)} g) are over your ${targets.netCarbsG} g limit.`}{' '}
              Predicted blood ketones arrive with the ketosis engine (phase 7).
            </p>
          </section>
        </div>
      </div>
    </>
  )
}
