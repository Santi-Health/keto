import { useState } from 'react'
import { useData } from '../lib/data'
import {
  CARDIO_TYPES,
  EXERCISE_KINDS,
  YOGA_STYLES,
  estimateExerciseKcal,
  pace,
  speed,
  type CardioType,
  type Exercise,
  type ExerciseKind,
  type Intensity,
  type GymId,
  type Lift,
  type WeightUnit,
  GYM_IDS,
  liftUnit,
  liftWeight,
  type YogaStyle,
} from '../lib/exercise'
import { getGoogleToken, heartRateCalories, type HrProfile } from '../lib/googleHealth'
import { Segmented } from './Fields'
import { libraryFor } from '../lib/library'
import { deviceTz } from '../lib/time'
import { Sheet } from './Sheet'

interface Props {
  weightKg: number
  /** Age, sex and resting burn for heart-rate calories; without it the Fitbit button is hidden. */
  hr?: Omit<HrProfile, 'weightKg'>
  /** Existing session to edit; omit to log a new one. */
  exercise?: Exercise
  /** Day to log on (YYYY-MM-DD); defaults to now. */
  date?: string
  onClose: () => void
}

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

function defaultStart(date?: string): Date {
  const now = new Date()
  if (!date) return now
  const d = new Date(`${date}T18:00:00`)
  return d.toDateString() === now.toDateString() ? now : d
}

export function ExerciseSheet({ weightKg, hr, exercise, date, onClose }: Props) {
  const { saveExercise, deleteExercise } = useData()
  const [kind, setKind] = useState<ExerciseKind>(exercise?.kind ?? 'strength')
  const [cardioType, setCardioType] = useState<CardioType>(exercise?.meta.cardioType ?? 'stairmaster')
  const [yogaStyle, setYogaStyle] = useState<YogaStyle>(exercise?.meta.yogaStyle ?? 'flow')
  const [distance, setDistance] = useState(exercise?.meta.distanceMi != null ? String(exercise.meta.distanceMi) : '')
  const [floors, setFloors] = useState(exercise?.meta.floors != null ? String(exercise.meta.floors) : '')
  const [level, setLevel] = useState(exercise?.meta.level != null ? String(exercise.meta.level) : '')
  const [minutes, setMinutes] = useState(String(exercise?.duration_min ?? 45))
  const [intensity, setIntensity] = useState<Intensity>(exercise?.intensity ?? 'moderate')
  const [start, setStart] = useState(toLocalInput(exercise ? new Date(exercise.started_at) : defaultStart(date)))
  const [fasted, setFasted] = useState(exercise?.meta.fasted ?? false)
  const [note, setNote] = useState(exercise?.note ?? '')
  const [lifts, setLifts] = useState<Lift[]>(exercise?.meta.lifts ?? [])
  // Calories follow the estimate until typed over.
  const [kcalText, setKcalText] = useState(exercise && !exercise.meta.caloriesEstimated ? String(exercise.calories ?? '') : '')
  const [hrResult, setHrResult] = useState<{ avgHr: number; samples: number } | null>(
    exercise?.meta.caloriesSource === 'heart-rate' && exercise.meta.avgHr ? { avgHr: exercise.meta.avgHr, samples: exercise.meta.hrSamples ?? 0 } : null,
  )
  const [hrBusy, setHrBusy] = useState(false)
  const [hrMessage, setHrMessage] = useState<string | null>(null)

  async function useHeartRate() {
    if (!hr || !(Number(minutes) > 0)) return
    setHrBusy(true)
    setHrMessage(null)
    try {
      const token = await getGoogleToken()
      const r = await heartRateCalories(token, new Date(start), Number(minutes), { ...hr, weightKg })
      if (!r) {
        setHrMessage('No Fitbit heart rate found for that time. Check the start time, or let the Fitbit app sync first.')
        return
      }
      setKcalText(String(r.kcal))
      setHrResult({ avgHr: r.avgHr, samples: r.samples })
    } catch (e) {
      setHrMessage(`Couldn't read heart rate: ${(e as Error).message}`)
    } finally {
      setHrBusy(false)
    }
  }

  const mins = Number(minutes)
  const details = {
    cardioType: kind === 'cardio' ? cardioType : undefined,
    distanceMi: kind === 'cardio' && (cardioType === 'running' || cardioType === 'cycling') && distance !== '' ? Number(distance) : null,
    floors: kind === 'cardio' && cardioType === 'stairmaster' && floors !== '' ? Number(floors) : null,
    level: kind === 'cardio' && cardioType === 'stairmaster' && level !== '' ? Number(level) : null,
    yogaStyle: kind === 'mobility' ? yogaStyle : undefined,
  }
  const estimate = mins > 0 ? estimateExerciseKcal(kind, intensity, mins, weightKg, details) : 0
  const calories = kcalText !== '' ? Number(kcalText) : estimate

  function save() {
    if (!(mins > 0)) return
    saveExercise({
      id: exercise?.id ?? crypto.randomUUID(),
      started_at: new Date(start).toISOString(),
      kind,
      duration_min: mins,
      intensity,
      calories: Number.isFinite(calories) ? calories : estimate,
      source: exercise?.source ?? 'manual',
      external_id: exercise?.external_id ?? null,
      note: note.trim() || null,
      meta: {
        ...exercise?.meta,
        ...details,
        tz: exercise?.meta.tz ?? deviceTz(),
        fasted,
        // Changing an imported session's type teaches future imports.
        userEdited:
          exercise?.meta.userEdited ||
          (exercise?.source === 'fitbit' && (kind !== exercise.kind || details.cardioType !== exercise.meta.cardioType)) ||
          undefined,
        lifts: kind === 'strength' ? lifts.filter((l) => l.name.trim()) : undefined,
        caloriesEstimated: kcalText === '',
        // Heart-rate calories stay marked as such only while the number is the one it produced.
        caloriesSource: hrResult && kcalText !== '' ? 'heart-rate' : undefined,
        avgHr: hrResult?.avgHr ?? exercise?.meta.avgHr,
        hrSamples: hrResult?.samples,
      },
      updated_at: new Date().toISOString(),
      deleted_at: null,
    })
    onClose()
  }

  const setLift = (i: number, change: Partial<Lift>) => setLifts((prev) => prev.map((l, j) => (j === i ? { ...l, ...change } : l)))
  const num = (v: string) => (v === '' ? null : Number(v))

  return (
    <Sheet
      title={exercise ? 'Edit exercise' : 'Log exercise'}
      subtitle={
        exercise?.source === 'fitbit'
          ? `From Fitbit${exercise.meta.fitbitType ? ` (${exercise.meta.fitbitType.toLowerCase().replace(/_/g, ' ')})` : ''}. Change the type and future imports will learn it.`
          : undefined
      }
      onClose={onClose}
    >
      <div className="field">
        <span className="label">Type</span>
        <div className="chips">
          {EXERCISE_KINDS.filter((k) => k.shown || k.value === kind).map((k) => (
            <button
              key={k.value}
              type="button"
              className={`chip-btn ${kind === k.value ? 'on' : ''}`}
              aria-pressed={kind === k.value}
              onClick={() => setKind(k.value)}
            >
              {k.emoji} {k.label}
            </button>
          ))}
        </div>
      </div>

      {kind === 'cardio' && (
        <div className="field">
          <span className="label">Cardio</span>
          <div className="chips">
            {CARDIO_TYPES.map((c) => (
              <button key={c.value} type="button" className={`chip-btn ${cardioType === c.value ? 'on' : ''}`} aria-pressed={cardioType === c.value} onClick={() => setCardioType(c.value)}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {kind === 'mobility' && (
        <div className="field">
          <span className="label">Yoga style</span>
          <div className="chips">
            {YOGA_STYLES.map((y) => (
              <button key={y.value} type="button" className={`chip-btn ${yogaStyle === y.value ? 'on' : ''}`} aria-pressed={yogaStyle === y.value} onClick={() => setYogaStyle(y.value)}>
                {y.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="row">
        <div className="field">
          <label htmlFor="ex-min">Duration</label>
          <div className="row">
            <input id="ex-min" type="number" inputMode="numeric" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            <span className="muted small" style={{ flex: 'none' }}>min</span>
          </div>
        </div>
        <div className="field" style={{ flex: 1.4 }}>
          <label htmlFor="ex-start">Started</label>
          <input id="ex-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
      </div>

      <Segmented
        label="Intensity"
        value={intensity}
        options={[
          { value: 'low', label: 'Easy' },
          { value: 'moderate', label: 'Moderate' },
          { value: 'high', label: 'Hard' },
        ]}
        onChange={setIntensity}
      />

      {kind === 'cardio' && (cardioType === 'running' || cardioType === 'cycling') && (
        <div className="field">
          <label htmlFor="ex-dist">Distance (optional, sharpens the estimate)</label>
          <div className="row">
            <input id="ex-dist" type="number" inputMode="decimal" step="0.01" value={distance} onChange={(e) => setDistance(e.target.value)} />
            <span className="muted small" style={{ flex: 'none' }}>mi{Number(distance) > 0 && mins > 0 ? ` · ${cardioType === 'cycling' ? speed(Number(distance), mins) : pace(Number(distance), mins)}` : ''}</span>
          </div>
        </div>
      )}
      {kind === 'cardio' && cardioType === 'stairmaster' && (
        <div className="row">
          <div className="field">
            <label htmlFor="ex-level">Level (optional)</label>
            <input id="ex-level" type="number" inputMode="numeric" value={level} onChange={(e) => setLevel(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ex-floors">Floors (optional)</label>
            <input id="ex-floors" type="number" inputMode="numeric" value={floors} onChange={(e) => setFloors(e.target.value)} />
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="ex-kcal">Active calories</label>
        <div className="row">
          <input
            id="ex-kcal"
            type="number"
            inputMode="numeric"
            value={kcalText}
            placeholder={String(estimate)}
            onChange={(e) => {
              setKcalText(e.target.value)
              setHrResult(null)
            }}
          />
          <span className="muted small" style={{ flex: 'none' }}>kcal</span>
        </div>
        <div className="hint">
          {hrResult
            ? `From your Fitbit heart rate: average ${hrResult.avgHr} bpm over ${minutes} min, minus what you'd burn resting. `
            : kcalText === ''
              ? `Estimated ${estimate} kcal from the activity type, intensity and your weight. `
              : ''}
          Type your watch's number to use it instead.
        </div>
        {hr && exercise?.source !== 'fitbit' && (
          <button type="button" className="btn secondary small-btn" style={{ marginTop: 6 }} disabled={hrBusy} onClick={() => void useHeartRate()}>
            {hrBusy ? 'Reading heart rate…' : '♥ Use Fitbit heart rate'}
          </button>
        )}
        {hrMessage && <div className="hint">{hrMessage}</div>}
      </div>

      <label className="check">
        <input type="checkbox" checked={fasted} onChange={(e) => setFasted(e.target.checked)} />
        Done fasted (no food in the 3+ hours before)
      </label>

      {kind === 'strength' && (
        <>
          <div className="section-label">Lifts (optional, lets the app spot strength trends)</div>
          {lifts.map((l, i) => (
            <div key={i} className="lift-row">
              <input type="text" aria-label="Lift" list={`lift-options-${i}`} placeholder="Pick or type" value={l.name} onChange={(e) => setLift(i, { name: e.target.value })} />
              <datalist id={`lift-options-${i}`}>
                {libraryFor(l.gym).map((x) => (
                  <option key={x.id} value={x.name} />
                ))}
              </datalist>
              <input type="number" inputMode="decimal" aria-label="Weight" placeholder="weight" value={liftWeight(l) ?? ''} onChange={(e) => setLift(i, { weight: num(e.target.value), weightLb: null })} />
              <select aria-label="Unit" value={liftUnit(l)} onChange={(e) => setLift(i, { unit: e.target.value as WeightUnit })}>
                <option value="lb">lb</option>
                <option value="kg">kg</option>
              </select>
              <input type="number" inputMode="numeric" aria-label="Reps" placeholder="reps" value={l.reps ?? ''} onChange={(e) => setLift(i, { reps: num(e.target.value) })} />
              <input type="number" inputMode="numeric" aria-label="Sets" placeholder="sets" value={l.sets ?? ''} onChange={(e) => setLift(i, { sets: num(e.target.value) })} />
              <label className="check">
                <input type="checkbox" checked={!!l.assisted} onChange={(e) => setLift(i, { assisted: e.target.checked })} /> Assisted
              </label>
              <select aria-label="Gym" value={l.gym ?? ''} onChange={(e) => setLift(i, { gym: (e.target.value || undefined) as GymId | undefined })}>
                <option value="">Gym</option>
                {GYM_IDS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <button type="button" className="icon-btn" aria-label="Remove lift" onClick={() => setLifts(lifts.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn secondary" onClick={() => setLifts([...lifts, { name: '', weight: null, unit: 'lb', weightLb: null, reps: null, sets: null, assisted: false }])}>
            + Add lift
          </button>
        </>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="ex-note">Note (optional)</label>
        <input id="ex-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. legs day, felt strong" />
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={save} disabled={!(mins > 0)}>
          {exercise ? 'Save changes' : 'Log exercise'}
        </button>
        {exercise && (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              deleteExercise(exercise.id)
              onClose()
            }}
          >
            Delete
          </button>
        )}
      </div>
    </Sheet>
  )
}
