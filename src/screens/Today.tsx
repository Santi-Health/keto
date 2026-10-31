import { Bar, Ring } from '../components/Progress'
import type { Targets } from '../lib/targets'

interface Props {
  targets: Targets
  onOpenSettings: () => void
}

// Food logging arrives in phase 2; until then every total is zero.
const EMPTY_TOTALS = {
  netCarbs: 0,
  protein: 0,
  fat: 0,
  calories: 0,
  fiber: 0,
  sodium: 0,
  potassium: 0,
  magnesium: 0,
}

export function Today({ targets, onOpenSettings }: Props) {
  const totals = EMPTY_TOTALS
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
              <Ring label="Calories" value={totals.calories} target={targets.calories} unit="" color="var(--calories)" />
            </div>
            <p className="muted small" style={{ marginBottom: 0 }}>
              {targets.burnSource === 'fitbit'
                ? `Calories based on ${targets.burn?.toLocaleString()} kcal burned (Fitbit).`
                : targets.burn != null
                  ? `Calories based on an estimated ${targets.burn.toLocaleString()} kcal burn. Fitbit will replace this in phase 6.`
                  : 'Add your height in Settings to get a calorie target.'}
            </p>
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
            <h2>Ketosis</h2>
            <p className="muted small" style={{ margin: 0 }}>
              Predicted blood ketones will show here once food logging (phase 2) and the ketosis engine (phase 7) are built.
            </p>
          </section>

          <section className="card">
            <h2>Quick add</h2>
            <div className="quick">
              {['Search food', 'Scan barcode', 'Label photo', 'Saved meal', 'Reading', 'Exercise'].map((label) => (
                <button key={label} type="button" disabled title="Coming in a later phase">
                  {label}
                </button>
              ))}
            </div>
            <p className="muted small" style={{ marginBottom: 0 }}>These turn on as each phase is built.</p>
          </section>
        </div>
      </div>
    </>
  )
}
