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
  repsPerSide,
  type LiftSide,
  type LiftMeasure,
  isTimed,
  type YogaStyle,
} from '../lib/exercise'
import { getGoogleToken, heartRateCalories, type HrProfile } from '../lib/googleHealth'
import { Segmented } from './Fields'
import { findLift, libraryFor, newLibraryEntries, suggestLift, tidyLiftName, useCustomLifts } from '../lib/library'
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
  const { custom, add: addCustom } = useCustomLifts()
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
    const named = kind === 'strength' ? lifts.filter((l) => l.name.trim()).map((l) => ({ ...l, name: tidyLiftName(l.name) })) : []
    // Lifts typed in that aren't in the list yet join it, at that gym (or every gym for free weights and bodyweight).
    addCustom(newLibraryEntries(named, libraryFor(undefined, custom)))
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
        lifts: kind === 'strength' ? named : undefined,
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
  // Picking a hold or a cardio piece from the list switches it to seconds or minutes.
  const withMeasure = (name: string): Partial<Lift> => {
    const known = findLift(name, libraryFor(undefined, custom))
    return known ? { name, measure: known.measure } : { name }
  }
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
            <div key={i} className="lift-card">
              <div className="lift-top">
                <select aria-label="Gym" value={l.gym ?? ''} onChange={(e) => setLift(i, { gym: (e.target.value || undefined) as GymId | undefined })}>
                  <option value="">Any gym</option>
                  {GYM_IDS.map((g) => (
                    <option key={g} value={g}>
                      {g === 'Home' ? 'Home' : `Gym ${g}`}
                    </option>
                  ))}
                </select>
                <button type="button" className="icon-btn" aria-label="Remove lift" onClick={() => setLifts(lifts.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
              <input type="text" className="lift-name" aria-label="Lift" list={`lift-options-${i}`} placeholder="Lift name (tap to pick or type)" value={l.name} onChange={(e) => setLift(i, withMeasure(e.target.value))} />
              <LiftNameHint name={l.name} gym={l.gym} custom={custom} onPick={(name) => setLift(i, withMeasure(name))} />
              <div className="lift-opts">
                <select aria-label="Measured in" value={l.measure ?? 'reps'} onChange={(e) => setLift(i, { measure: e.target.value === 'reps' ? undefined : (e.target.value as LiftMeasure) })}>
                  <option value="reps">Reps</option>
                  <option value="s">Seconds</option>
                  <option value="min">Minutes</option>
                </select>
                {l.measure !== 'min' && (
                  <>
                    <label className="check">
                      <input type="checkbox" checked={!!l.assisted} onChange={(e) => setLift(i, { assisted: e.target.checked })} /> Assisted
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={l.bells === 2} onChange={(e) => setLift(i, { bells: e.target.checked ? 2 : undefined })} /> Two bells
                    </label>
                    <select aria-label="Side" value={l.side ?? ''} onChange={(e) => setLift(i, { side: (e.target.value || undefined) as LiftSide | undefined })}>
                      <option value="">Both together</option>
                      <option value="left">Left only</option>
                      <option value="right">Right only</option>
                      <option value="both">Alternating sides (L + R)</option>
                    </select>
                  </>
                )}
              </div>
              <datalist id={`lift-options-${i}`}>
                {libraryFor(l.gym, custom).map((x) => (
                  <option key={x.id} value={x.name} />
                ))}
              </datalist>
              <div className="lift-nums">
                <label>
                  <span>{l.measure === 'min' ? 'Level' : l.assisted ? 'Assist' : l.bells === 2 ? 'Each bell' : l.measure === 's' ? 'Weight (opt.)' : 'Weight'}</span>
                  <input type="number" inputMode="decimal" value={liftWeight(l) ?? ''} onChange={(e) => setLift(i, { weight: num(e.target.value), weightLb: null })} />
                </label>
                {l.measure !== 'min' ? (
                  <label>
                    <span>Unit</span>
                    <select value={liftUnit(l)} onChange={(e) => setLift(i, { unit: e.target.value as WeightUnit })}>
                      <option value="lb">lb</option>
                      <option value="kg">kg</option>
                    </select>
                  </label>
                ) : (
                  <span />
                )}
                {isTimed(l) ? (
                  <label>
                    <span>{l.measure === 'min' ? 'Minutes' : 'Seconds'}</span>
                    <input type="number" inputMode="decimal" value={l.duration ?? ''} onChange={(e) => setLift(i, { duration: num(e.target.value) })} />
                  </label>
                ) : (
                  <label>
                    <span>{l.side === 'both' ? 'Reps (total)' : 'Reps'}</span>
                    <input type="number" inputMode="numeric" value={l.reps ?? ''} onChange={(e) => setLift(i, { reps: num(e.target.value) })} />
                  </label>
                )}
                <label>
                  <span>Sets</span>
                  <input type="number" inputMode="numeric" value={l.sets ?? ''} onChange={(e) => setLift(i, { sets: num(e.target.value) })} />
                </label>
              </div>
              {!isTimed(l) && (l.bells === 2 || l.side) && l.reps != null && (
                <div className="muted small">
                  {l.bells === 2 && liftWeight(l) != null && `${liftWeight(l)! * 2} ${liftUnit(l)} total · `}
                  {l.side === 'left' || l.side === 'right'
                    ? `${l.reps} reps, ${l.side} side`
                    : l.side === 'both'
                      ? `${repsPerSide(l)! % 1 ? repsPerSide(l)!.toFixed(1) : repsPerSide(l)} reps per side`
                      : `${l.reps} reps, both arms each rep`}
                </div>
              )}
            </div>
          ))}
          <button type="button" className="btn secondary" onClick={() => setLifts([...lifts, { name: '', weight: null, unit: lifts.length ? liftUnit(lifts[lifts.length - 1]) : 'lb', weightLb: null, reps: null, sets: null, assisted: false, gym: lifts[lifts.length - 1]?.gym }])}>
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

/** Under the lift name: "Did you mean …?" for a near miss, or a note that a new name joins the list. */
function LiftNameHint({ name, gym, custom, onPick }: { name: string; gym?: GymId; custom: ReturnType<typeof useCustomLifts>['custom']; onPick: (name: string) => void }) {
  const all = libraryFor(undefined, custom)
  if (!name.trim() || findLift(name, all)) return null
  const near = suggestLift(name, all)
  if (near)
    return (
      <div className="small lift-hint">
        Did you mean{' '}
        <button type="button" className="link" onClick={() => onPick(near.name)}>
          {near.name}
        </button>
        ?
      </div>
    )
  const entry = newLibraryEntries([{ name, gym }], all)[0]
  if (!entry) return null
  const where = entry.gyms.includes('any') ? 'every gym' : `Gym ${entry.gyms[0]}`
  return <div className="muted small lift-hint">New lift: "{entry.name}" joins the list for {where} when you save.</div>
}
