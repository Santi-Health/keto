import { useState } from 'react'
import { LEUCINE_PER_MEAL_G, aminoTargets, estimateAminos, type MuscleGoal } from '../lib/aminoAcids'
import { MEALS, type LogEntry } from '../lib/foods'
import { addNutrients } from '../lib/nutrients'
import { Molecule } from './Molecules'

interface Props {
  logs: LogEntry[]
  weightKg: number
  goal: MuscleGoal
}

/** Essential amino acids against the RDA and a muscle-building level, plus leucine per meal. */
export function AminoCard({ logs, weightKg, goal }: Props) {
  const [showAll, setShowAll] = useState(false)
  // Older entries and foods without amino acid data get estimated from protein.
  const withAminos = logs.map((l) => ({ ...l, nutrients: estimateAminos(l.nutrients) }))
  const total = addNutrients(withAminos.map((l) => l.nutrients))
  const targets = aminoTargets(total, weightKg)
  const leuPerMeal = LEUCINE_PER_MEAL_G[goal]
  const meals = MEALS.map((m) => {
    const items = withAminos.filter((l) => l.meal === m.value)
    return { ...m, count: items.length, leu: items.reduce((s, l) => s + (l.nutrients.leuG ?? 0), 0) }
  }).filter((m) => m.count > 0)
  const estimatedPct = total.protein > 0 ? Math.min(100, (total.aminoEstimatedG / total.protein) * 100) : 0
  const shown = showAll ? targets : targets.slice(0, 3)

  return (
    <section className="card">
      <div className="ketosis-head">
        <Molecule molecule="leucine" size={84} showFormula />
        <div>
          <h2 style={{ color: 'var(--atom-n)' }}>Amino acids</h2>
          <div className="muted small">Leucine switches on muscle building. Aim for {leuPerMeal} g per meal to {goal === 'build' ? 'build' : 'keep'} muscle.</div>
        </div>
      </div>

      {meals.length > 0 ? (
        <div className="chips" style={{ marginBottom: 12 }}>
          {meals.map((m) => (
            <span key={m.value} className={`chip ${m.leu >= leuPerMeal ? 'ok' : 'warn'}`}>
              {m.label}: {m.leu.toFixed(1)} g leucine {m.leu >= leuPerMeal ? '✓' : `(aim ${leuPerMeal} g)`}
            </span>
          ))}
        </div>
      ) : (
        <p className="muted small">Log a meal to see its leucine.</p>
      )}

      {shown.map((a) => {
        const max = Math.max(a.muscle, a.value, 0.0001)
        return (
          <div className="bar-row" key={a.key}>
            <div className="bar-head">
              <span>{a.name}</span>
              <span className="muted">
                {estimatedPct > 0 ? '~' : ''}
                {a.value.toFixed(1)} / {a.muscle.toFixed(1)} g
              </span>
            </div>
            <div className="bar amino-bar" role="progressbar" aria-label={a.name} aria-valuenow={a.value} aria-valuemax={a.muscle}>
              <span style={{ width: `${Math.min(a.value / max, 1) * 100}%`, background: 'var(--atom-n)' }} />
              <i style={{ left: `${(a.rda / max) * 100}%` }} title={`Minimum (RDA): ${a.rda.toFixed(1)} g`} />
            </div>
          </div>
        )
      })}
      <button type="button" className="link" style={{ margin: '10px 0 0' }} onClick={() => setShowAll(!showAll)}>
        {showAll ? 'Show fewer' : 'Show all 9 essential amino acids'}
      </button>

      <p className="muted small" style={{ marginBottom: 0 }}>
        Bar = muscle level (what 1.6 g/kg of quality protein provides); tick = minimum (RDA).
        {estimatedPct > 0 && ` ~${Math.round(estimatedPct)}% of today's protein had no amino acid data and was estimated from a typical animal-protein profile.`}
      </p>
    </section>
  )
}
