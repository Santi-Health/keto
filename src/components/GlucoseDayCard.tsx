import { useMemo, useState } from 'react'
import { GlucoseChart } from './GlucoseChart'
import { catchUpDays } from '../lib/activity'
import { mergeIntoDays, parseGlucosePoint, toReadings } from '../lib/cgm'
import { useData } from '../lib/data'
import { sessionLabel } from '../lib/exercise'
import { getGoogleToken, listGlucose } from '../lib/googleHealth'
import { exerciseEffects, mealResponses, summarize, type ResponseLevel } from '../lib/glucoseInsights'
import { localDate } from '../lib/targets'

const time = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const LEVEL: Record<ResponseLevel, { label: string; cls: string }> = {
  steady: { label: 'Steady', cls: 'ok' },
  moderate: { label: 'Moderate', cls: '' },
  spike: { label: 'Spike', cls: 'warn' },
}

/** Pulls Lingo readings from Google Health: everything since the last CGM day (at least 3 days), 14 days the first time. */
export function GlucoseImport() {
  const { cgmDays, saveCgmDay } = useData()
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function importGlucose() {
    setImporting(true)
    setMessage(null)
    try {
      const token = await getGoogleToken()
      const today = localDate()
      const lastDay = Object.values(cgmDays).filter((d) => !d.deleted_at).map((d) => d.day).sort().pop() ?? null
      const from = new Date()
      from.setDate(from.getDate() - (catchUpDays(lastDay, today, { min: 3, first: 14 }) - 1))
      from.setHours(0, 0, 0, 0)
      const raw = await listGlucose(token, from, new Date())
      const parsed = raw.map(parseGlucosePoint).filter((r): r is NonNullable<typeof r> => !!r)
      const days = mergeIntoDays(parsed, cgmDays)
      for (const d of days) saveCgmDay(d)
      setMessage(
        parsed.length
          ? `Imported ${parsed.length.toLocaleString()} glucose readings across ${days.length} day${days.length === 1 ? '' : 's'}.`
          : raw.length
            ? `Google Health returned ${raw.length} points but none had a glucose value I could read. Send me a screenshot of this message.`
            : 'No glucose found in Google Health yet. In the Google Health app: profile → Partner Apps → connect Lingo, then try again in a bit.',
      )
    } catch (e) {
      setMessage(`Couldn't import: ${(e as Error).message}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="glucose-import">
      <button type="button" className="btn secondary" onClick={() => void importGlucose()} disabled={importing}>
        {importing ? 'Importing glucose…' : '🩸 Import glucose'}
      </button>
      {message && <p className="muted small" style={{ margin: '6px 0 0' }}>{message}</p>}
    </div>
  )
}

/** A day's CGM curve with meals and workouts, its numbers, and how each meal and session moved it. */
export function GlucoseDayCard({ day }: { day: string }) {
  const { cgmDays, logsOn, exercisesOn } = useData()
  const readings = useMemo(() => (cgmDays[day] && !cgmDays[day].deleted_at ? toReadings([cgmDays[day]]) : []), [cgmDays, day])
  const dayLogs = logsOn(day)
  const daySessions = exercisesOn(day)
  const summary = summarize(readings)
  const responses = useMemo(() => mealResponses(dayLogs, readings, daySessions), [dayLogs, readings, daySessions])
  const effects = useMemo(() => exerciseEffects(daySessions, readings), [daySessions, readings])

  return (
    <section className="card">
      <h2>Glucose</h2>
      {readings.length ? (
        <>
          <GlucoseChart day={day} readings={readings} logs={dayLogs} exercises={daySessions} />
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Green band = 70–140 mg/dL · <span style={{ color: 'var(--fat)' }}>▲</span> meals · <span style={{ color: 'var(--protein)' }}>■</span> workouts
          </p>
        </>
      ) : (
        <p className="muted small">No CGM data for this day. Tap 🩸 Import glucose (under Drinks) to pull your Lingo readings.</p>
      )}
      {summary && (
        <>
          <div className="stat-grid" style={{ marginTop: 10 }}>
            <div>
              <b>{summary.avg}</b>
              <span>Average mg/dL</span>
            </div>
            <div>
              <b>{summary.inRangePct}%</b>
              <span>In 70–140</span>
            </div>
            <div>
              <b>{summary.cv}%</b>
              <span>Variability {summary.cv < 20 ? '(steady)' : summary.cv < 30 ? '(some swings)' : '(swingy)'}</span>
            </div>
            <div>
              <b>{summary.overnight ?? '—'}</b>
              <span>3–6 AM avg</span>
            </div>
          </div>
          <p className="muted small">
            Range {summary.min}–{summary.max} mg/dL · {summary.abovePct}% above 140 · {summary.belowPct}% below 70. Lingo lags blood by ~10–15 min.
          </p>
        </>
      )}
      {responses.length > 0 && (
        <>
          <div className="section-label">How meals hit you</div>
          {responses.map((r) => (
            <div key={r.start} className="insight-row">
              <span className="row" style={{ justifyContent: 'space-between' }}>
                <b style={{ flex: 1 }}>
                  {time(r.start)} · {r.foods.join(', ')}
                </b>
                <span className={`badge ${LEVEL[r.level].cls}`} style={{ flex: 'none' }}>
                  {LEVEL[r.level].label} +{r.rise}
                </span>
              </span>
              <span className="muted small">
                {r.baseline} → {r.peak} mg/dL, peak after {r.minutesToPeak} min
                {r.recoveredAfter ? `, back to baseline by ${r.recoveredAfter} min` : r.cutByExercise ? '' : ', still up after 3 h'} · {r.netCarbs.toFixed(1)} g net carbs
                {r.cutByExercise ? ' · measured only until your workout started' : ''}
              </span>
            </div>
          ))}
        </>
      )}
      {effects.length > 0 && (
        <>
          <div className="section-label">Exercise effect</div>
          {effects.map((e) => (
            <div key={e.exercise.id} className="insight-row">
              <b>
                {time(Date.parse(e.exercise.started_at))} · {sessionLabel(e.exercise)} · {e.exercise.duration_min} min
              </b>
              <span className="muted small">
                Before {e.before} · during {e.lowest}–{e.highest}
                {e.oneHourAfter != null ? ` · 1 h after ${e.oneHourAfter}` : ''} mg/dL
              </span>
            </div>
          ))}
        </>
      )}
    </section>
  )
}
