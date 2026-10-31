import { useMemo, useState } from 'react'
import { GlucoseChart } from '../components/GlucoseChart'
import { BodyScanCard } from '../components/BodyScan'
import { KetoModelCard } from '../components/KetoModelCard'
import { TrendsCard } from '../components/TrendsCard'
import type { RangeDays } from '../lib/trends'
import type { Targets } from '../lib/targets'
import type { WeightUnit } from '../lib/types'
import { useKetoModel } from '../lib/useKetoModel'
import { mergeIntoDays, parseGlucosePoint, toReadings } from '../lib/cgm'
import { useData } from '../lib/data'
import { sessionLabel } from '../lib/exercise'
import { getGoogleToken, listGlucose } from '../lib/googleHealth'
import { exerciseEffects, foodImpacts, mealResponses, oddThings, summarize, type ResponseLevel } from '../lib/glucoseInsights'
import { localDate } from '../lib/targets'

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return localDate(d)
}
const time = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const LEVEL: Record<ResponseLevel, { label: string; cls: string }> = {
  steady: { label: 'Steady', cls: 'ok' },
  moderate: { label: 'Moderate', cls: '' },
  spike: { label: 'Spike', cls: 'warn' },
}

interface Props {
  targets: Targets
  weightUnit: WeightUnit
  onApplyLimit: (g: number) => void
  onOpenReport: (days: RangeDays) => void
}

export function Insights({ targets, weightUnit, onApplyLimit, onOpenReport }: Props) {
  const netCarbLimit = targets.netCarbsG
  const proteinTarget = targets.proteinG
  const ketoModel = useKetoModel(netCarbLimit, proteinTarget)
  const { cgmDays, saveCgmDay, logsOn, exercisesOn, logs, exercises } = useData()
  const today = localDate()
  const [day, setDay] = useState(today)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const readings = useMemo(() => (cgmDays[day] ? toReadings([cgmDays[day]]) : []), [cgmDays, day])
  const dayLogs = logsOn(day)
  const daySessions = exercisesOn(day)
  const summary = summarize(readings)
  const responses = useMemo(() => mealResponses(dayLogs, readings, daySessions), [dayLogs, readings, daySessions])
  const odd = useMemo(() => oddThings(readings, dayLogs, daySessions, responses), [readings, dayLogs, daySessions, responses])
  const effects = useMemo(() => exerciseEffects(daySessions, readings), [daySessions, readings])

  // Foods ranked over the last 14 days of CGM data.
  const ranked = useMemo(() => {
    const days = Object.values(cgmDays).filter((d) => !d.deleted_at && d.day >= shift(today, -13))
    const all = toReadings(days)
    const from = shift(today, -13)
    const recentLogs = logs.filter((l) => localDate(new Date(l.eaten_at)) >= from)
    const recentSessions = exercises.filter((e) => localDate(new Date(e.started_at)) >= from)
    return foodImpacts(mealResponses(recentLogs, all, recentSessions))
  }, [cgmDays, logs, exercises, today])

  async function importGlucose() {
    setImporting(true)
    setMessage(null)
    try {
      const token = await getGoogleToken()
      const hasAny = Object.keys(cgmDays).length > 0
      const from = new Date()
      from.setDate(from.getDate() - (hasAny ? 3 : 14))
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

  const label =
    day === today ? 'Today' : day === shift(today, -1) ? 'Yesterday' : new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <>
      <header className="page-header">
        <h1>Insights</h1>
        <button type="button" className="btn secondary" onClick={() => void importGlucose()} disabled={importing}>
          {importing ? 'Importing…' : '🩸 Import'}
        </button>
      </header>
      {message && <p className="notice small">{message}</p>}

      <div className="grid two">
        <div className="grid">
          <section className="card">
            <div className="page-header" style={{ marginBottom: 6 }}>
              <h2>{label}</h2>
              <div className="row" style={{ flex: 'none' }}>
                <button type="button" className="icon-btn" aria-label="Previous day" onClick={() => setDay(shift(day, -1))}>
                  ‹
                </button>
                <button type="button" className="icon-btn" aria-label="Next day" disabled={day >= today} onClick={() => setDay(shift(day, 1))}>
                  ›
                </button>
              </div>
            </div>
            {readings.length ? (
              <>
                <GlucoseChart day={day} readings={readings} logs={dayLogs} exercises={daySessions} />
                <p className="muted small" style={{ margin: '4px 0 0' }}>
                  Green band = 70–140 mg/dL · <span style={{ color: 'var(--fat)' }}>▲</span> meals ·{' '}
                  <span style={{ color: 'var(--protein)' }}>■</span> workouts
                </p>
              </>
            ) : (
              <p className="muted small">No CGM data for this day. Tap 🩸 Import to pull your Lingo readings from Google Health.</p>
            )}
          </section>

          {summary && (
            <section className="card">
              <div className="stat-grid">
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
              <p className="muted small" style={{ marginBottom: 0 }}>
                Range {summary.min}–{summary.max} mg/dL · {summary.abovePct}% above 140 · {summary.belowPct}% below 70. Lingo measures
                fluid under the skin, which lags blood by ~10–15 min.
              </p>
            </section>
          )}

          {odd.length > 0 && (
            <section className="card">
              <h2>Things that don't add up</h2>
              {odd.map((o) => (
                <div key={o.at + o.kind} className="insight-row">
                  <b>
                    {o.kind === 'unlogged' ? '❓ ' : o.kind === 'low_carb_spike' ? '🔎 ' : o.kind === 'low' ? '⬇️ ' : 'ℹ️ '}
                    {o.title}
                  </b>
                  <span className="muted small">{o.detail}</span>
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="grid">
          <TrendsCard targets={targets} weightUnit={weightUnit} onOpenReport={onOpenReport} />

          <KetoModelCard model={ketoModel} netCarbLimit={netCarbLimit} onApplyLimit={onApplyLimit} />

          <BodyScanCard />

          <section className="card">
            <h2>How meals hit you</h2>
            {responses.length ? (
              responses.map((r) => (
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
                    {r.recoveredAfter ? `, back to baseline by ${r.recoveredAfter} min` : r.cutByExercise ? '' : ', still up after 3 h'} ·{' '}
                    {r.netCarbs.toFixed(1)} g net carbs
                    {r.cutByExercise ? ' · measured only until your workout started' : ''}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                {readings.length ? 'No logged meals with enough CGM data around them.' : 'Needs CGM data and logged meals for this day.'}
              </p>
            )}
          </section>

          {effects.length > 0 && (
            <section className="card">
              <h2>Exercise effect</h2>
              {effects.map((e) => (
                <div key={e.exercise.id} className="insight-row">
                  <b>
                    {time(Date.parse(e.exercise.started_at))} · {sessionLabel(e.exercise)} · {e.exercise.duration_min} min
                  </b>
                  <span className="muted small">
                    Before {e.before} · during {e.lowest}–{e.highest}
                    {e.oneHourAfter != null ? ` · 1 h after ${e.oneHourAfter}` : ''} mg/dL
                    {e.highest - e.before >= 20 ? ' · rose during the session (normal for hard efforts)' : ''}
                    {e.before - e.lowest >= 15 ? ' · dropped while active' : ''}
                  </span>
                </div>
              ))}
            </section>
          )}

          <section className="card">
            <h2>Your foods, last 14 days</h2>
            {ranked.length ? (
              <>
                {ranked.slice(0, 12).map((f) => (
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
                  Average rise after meals that included the food. Mixed meals share the credit, so treat it as a hint and look for patterns.
                </p>
              </>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>Builds up as you log meals while wearing the CGM.</p>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
