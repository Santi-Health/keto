import { isHardSession, sessionLabel, type Exercise, type Routine } from '../lib/exercise'

interface Props {
  today: Exercise[]
  daysSinceStrength: number | null
  warnings: { level: 'yellow' | 'red'; text: string }[]
  onLog: () => void
  /** Shown when today is a routine day and it isn't logged yet. */
  routine: Routine | null
  onLogRoutine: () => void
  onImportFitbit: () => void
  importing: boolean
  importMessage: string | null
}

export function TrainingCard({ today, daysSinceStrength, warnings, onLog, routine, onLogRoutine, onImportFitbit, importing, importMessage }: Props) {
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
          <div className="session-list">
            {today.map((e) => (
              <div key={e.id} className="session-row">
                <span className="grow">
                  {sessionLabel(e)}
                  <span className="muted small">
                    {' '}
                    · {e.duration_min} min{isHardSession(e) ? ' · hard' : ''}
                    {e.meta.fasted ? ' · fasted' : ''}
                    {e.source === 'fitbit' ? ' · ⌚' : ''}
                  </span>
                </span>
                <span className="session-kcal">
                  {e.meta.caloriesEstimated ? '~' : ''}+{e.calories ?? 0} kcal
                </span>
              </div>
            ))}
            <div className="session-row session-total">
              <span className="grow">Extra burned today · {minutes} min</span>
              <span className="session-kcal">+{active} kcal</span>
            </div>
          </div>
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            Extra = calories above what you'd burn sitting still for that time (your resting burn is already counted).
            ~ means estimated from the activity type, intensity and your weight.
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
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {routine && (
          <button type="button" className="btn" onClick={onLogRoutine}>
            🧘 Log usual yoga ({routine.minutes} min, {formatTime(routine.start)})
          </button>
        )}
        <button type="button" className="btn secondary" onClick={onImportFitbit} disabled={importing}>
          {importing ? 'Importing…' : '⌚ Import from Fitbit'}
        </button>
        <button type="button" className="btn secondary" onClick={onLog}>
          + Log exercise
        </button>
      </div>
      {importMessage && <p className="small" role="status" style={{ marginBottom: 0 }}>{importMessage}</p>}
    </section>
  )
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
