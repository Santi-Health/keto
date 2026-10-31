import { EXERCISE_KINDS, isHardSession, type Exercise } from '../lib/exercise'

interface Props {
  today: Exercise[]
  daysSinceStrength: number | null
  warnings: { level: 'yellow' | 'red'; text: string }[]
  onLog: () => void
}

export function TrainingCard({ today, daysSinceStrength, warnings, onLog }: Props) {
  const active = today.reduce((s, e) => s + (e.calories ?? 0), 0)
  const minutes = today.reduce((s, e) => s + e.duration_min, 0)
  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 8 }}>
        <h2>Training</h2>
        <span className={`badge ${daysSinceStrength != null && daysSinceStrength < 5 ? 'ok' : 'warn'}`}>
          {daysSinceStrength == null
            ? 'No lifting logged'
            : daysSinceStrength === 0
              ? 'Lifted today'
              : `Lifted ${daysSinceStrength} day${daysSinceStrength === 1 ? '' : 's'} ago`}
        </span>
      </div>
      {today.length > 0 ? (
        <>
          <div className="chips" style={{ marginBottom: 8 }}>
            {today.map((e) => {
              const k = EXERCISE_KINDS.find((x) => x.value === e.kind)!
              return (
                <span key={e.id} className="chip">
                  {k.emoji} {k.label} {e.duration_min} min{isHardSession(e) ? ' · hard' : ''}
                  {e.meta.fasted ? ' · fasted' : ''}
                </span>
              )
            })}
          </div>
          <p className="small" style={{ margin: 0 }}>
            {minutes} min · <strong>{active} active kcal</strong> burned on top of your resting burn.
          </p>
        </>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>No exercise logged today.</p>
      )}
      {warnings.map((w) => (
        <p key={w.text} className={w.level === 'red' ? 'notice small' : 'small'} style={w.level === 'yellow' ? { color: 'var(--carbs)' } : undefined}>
          {w.text}
        </p>
      ))}
      <p className="muted small">Exercise is saved for the ketosis model: hard and fasted sessions tend to raise ketones, and it will learn how much for you.</p>
      <button type="button" className="btn secondary" onClick={onLog}>
        + Log exercise
      </button>
    </section>
  )
}
