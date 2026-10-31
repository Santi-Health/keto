import { useState } from 'react'
import { useData } from '../lib/data'
import {
  CARDIO_TYPES,
  EXERCISE_KINDS,
  YOGA_STYLES,
  estimateExerciseKcal,
  pace,
  type CardioType,
  type Exercise,
  type ExerciseKind,
  type Intensity,
  type Lift,
  type YogaStyle,
} from '../lib/exercise'
import { Segmented } from './Fields'
import { Sheet } from './Sheet'

interface Props {
  weightKg: number
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

export function ExerciseSheet({ weightKg, exercise, date, onClose }: Props) {
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

  const mins = Number(minutes)
  const details = {
    cardioType: kind === 'cardio' ? cardioType : undefined,
    distanceMi: kind === 'cardio' && cardioType === 'running' && distance !== '' ? Number(distance) : null,
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
        fasted,
        lifts: kind === 'strength' ? lifts.filter((l) => l.name.trim()) : undefined,
        caloriesEstimated: kcalText === '',
      },
      updated_at: new Date().toISOString(),
      deleted_at: null,
    })
    onClose()
  }

  const setLift = (i: number, change: Partial<Lift>) => setLifts((prev) => prev.map((l, j) => (j === i ? { ...l, ...change } : l)))
  const num = (v: string) => (v === '' ? null : Number(v))

  return (
    <Sheet title={exercise ? 'Edit exercise' : 'Log exercise'} onClose={onClose}>
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

      {kind === 'cardio' && cardioType === 'running' && (
        <div className="field">
          <label htmlFor="ex-dist">Distance (optional, sharpens the estimate)</label>
          <div className="row">
            <input id="ex-dist" type="number" inputMode="decimal" step="0.01" value={distance} onChange={(e) => setDistance(e.target.value)} />
            <span className="muted small" style={{ flex: 'none' }}>mi{Number(distance) > 0 && mins > 0 ? ` · ${pace(Number(distance), mins)}` : ''}</span>
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
            onChange={(e) => setKcalText(e.target.value)}
          />
          <span className="muted small" style={{ flex: 'none' }}>kcal</span>
        </div>
        <div className="hint">
          {kcalText === '' ? `Estimated ${estimate} kcal from the activity type, intensity and your weight. ` : ''}
          Type your watch's number to use it instead.
        </div>
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
              <input type="text" aria-label="Lift" placeholder="Squat" value={l.name} onChange={(e) => setLift(i, { name: e.target.value })} />
              <input type="number" inputMode="decimal" aria-label="Weight in lb" placeholder="lb" value={l.weightLb ?? ''} onChange={(e) => setLift(i, { weightLb: num(e.target.value) })} />
              <input type="number" inputMode="numeric" aria-label="Reps" placeholder="reps" value={l.reps ?? ''} onChange={(e) => setLift(i, { reps: num(e.target.value) })} />
              <input type="number" inputMode="numeric" aria-label="Sets" placeholder="sets" value={l.sets ?? ''} onChange={(e) => setLift(i, { sets: num(e.target.value) })} />
              <button type="button" className="icon-btn" aria-label="Remove lift" onClick={() => setLifts(lifts.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn secondary" onClick={() => setLifts([...lifts, { name: '', weightLb: null, reps: null, sets: null }])}>
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
