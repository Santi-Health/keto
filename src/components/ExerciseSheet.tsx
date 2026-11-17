import { useEffect, useState } from 'react'
import { useData } from '../lib/data'
import {
  CARDIO_TYPES,
  EXERCISE_KINDS,
  YOGA_STYLES,
  fitbitStatus,
  startFromHeartRate,
  strengthMinutes,
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
  durationCheck,
  withMinutes,
  withSetAmounts,
  type YogaStyle,
} from '../lib/exercise'
import { cachedToken, listHeartRate, type HrProfile } from '../lib/googleHealth'
import { localDate } from '../lib/targets'
import { Segmented } from './Fields'
import { LIBRARY_GROUPS, findLift, groupForNew, libraryFor, photoFor, newLibraryEntries, suggestLift, tidyLiftName, useCustomLifts } from '../lib/library'
import { scoreLiftDraft, suggestFromHistory } from '../lib/training'
import { clearDraft, loadDraft, saveDraft } from '../lib/exerciseDraft'
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

export function ExerciseSheet({ weightKg, exercise, date, onClose }: Props) {
  const { saveExercise, deleteExercise, exercises, activity } = useData()
  // Your latest resting heart rate, for telling a workout's raised heart rate from rest.
  const restingHr = Object.values(activity).filter((a) => !a.deleted_at && a.resting_hr).sort((a, b) => b.day.localeCompare(a.day))[0]?.resting_hr ?? null
  const { custom, add: addCustom } = useCustomLifts()
  // An unsaved workout from earlier (left the sheet or the app) picks up where it was.
  const [draft] = useState(() => loadDraft(exercise?.id))
  const [restored, setRestored] = useState(!!draft)
  const [kind, setKind] = useState<ExerciseKind>((draft?.kind as ExerciseKind) ?? exercise?.kind ?? 'strength')
  const [cardioType, setCardioType] = useState<CardioType>((draft?.cardioType as CardioType) ?? exercise?.meta.cardioType ?? 'stairmaster')
  const [yogaStyle, setYogaStyle] = useState<YogaStyle>((draft?.yogaStyle as YogaStyle) ?? exercise?.meta.yogaStyle ?? 'flow')
  const [distance, setDistance] = useState(draft?.distance ?? (exercise?.meta.distanceMi != null ? String(exercise.meta.distanceMi) : ''))
  const [floors, setFloors] = useState(draft?.floors ?? (exercise?.meta.floors != null ? String(exercise.meta.floors) : ''))
  const [level, setLevel] = useState(draft?.level ?? (exercise?.meta.level != null ? String(exercise.meta.level) : ''))
  const [minutes, setMinutes] = useState(draft?.minutes ?? String(exercise?.duration_min ?? 45))
  const [intensity, setIntensity] = useState<Intensity>((draft?.intensity as Intensity) ?? exercise?.intensity ?? 'moderate')
  const [start, setStart] = useState(draft?.start ?? toLocalInput(exercise ? new Date(exercise.started_at) : defaultStart(date)))
  const [fasted, setFasted] = useState(draft?.fasted ?? exercise?.meta.fasted ?? false)
  const [note, setNote] = useState(draft?.note ?? exercise?.note ?? '')
  const [lifts, setLifts] = useState<Lift[]>(draft?.lifts ?? exercise?.meta.lifts ?? [])
  // Calories follow the estimate until typed over.
  const [kcalText] = useState(draft?.kcalText ?? (exercise && !exercise.meta.caloriesEstimated ? String(exercise.calories ?? '') : ''))
  // Keep the draft as you type, once anything differs from how the sheet opened.
  const snapshot = { kind, cardioType, yogaStyle, distance, floors, level, minutes, intensity, start, fasted, note, lifts, kcalText }
  const json = JSON.stringify(snapshot)
  const [opened] = useState(json)
  useEffect(() => {
    if (json !== opened || restored) saveDraft(exercise?.id, JSON.parse(json))
  }, [json, opened, restored, exercise?.id])
  function discardDraft() {
    clearDraft(exercise?.id)
    onClose()
  }
  const mins = Number(minutes)
  const details = {
    cardioType: kind === 'cardio' ? cardioType : undefined,
    distanceMi: kind === 'cardio' && (cardioType === 'running' || cardioType === 'cycling') && distance !== '' ? Number(distance) : null,
    floors: kind === 'cardio' && cardioType === 'stairmaster' && floors !== '' ? Number(floors) : null,
    level: kind === 'cardio' && cardioType === 'stairmaster' && level !== '' ? Number(level) : null,
    yogaStyle: kind === 'mobility' ? yogaStyle : undefined,
  }
  // Today's strength workout needs no clock: it ends when you save it (adding the last lift moves the end),
  // and it started as far back as your heart rate shows, else your sets say.
  const logDay = date ?? localDate()
  const autoTime = kind === 'strength' && exercise?.source !== 'fitbit' && logDay === localDate() && !exercise?.external_id
  const named = kind === 'strength' ? lifts.filter((l) => l.name.trim()).map((l) => ({ ...l, name: tidyLiftName(l.name) })) : []
  const autoMinutes = strengthMinutes(named)
  // Calories only ever come from Fitbit: an imported session's own number, or Fitbit's recording once it syncs.
  const fitbitKcal = exercise && (exercise.source === 'fitbit' || !exercise.meta.awaitingFitbit) && exercise.calories != null && !exercise.meta.caloriesEstimated ? exercise.calories : null

  function save() {
    const endMs = Date.now()
    const minutesNow = autoTime ? autoMinutes : mins
    if (!(minutesNow > 0)) return
    const startIso = autoTime ? new Date(endMs - autoMinutes * 60_000).toISOString() : new Date(start).toISOString()
    // Lifts typed in that aren't in the list yet join it, at that gym (or every gym for free weights and bodyweight).
    addCustom(newLibraryEntries(named, libraryFor(undefined, custom)))
    const row: Exercise = {
      id: exercise?.id ?? crypto.randomUUID(),
      started_at: startIso,
      kind,
      duration_min: minutesNow,
      intensity,
      calories: fitbitKcal,
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
        caloriesEstimated: false,
        caloriesSource: undefined,
        awaitingFitbit: fitbitKcal == null ? true : undefined,
        appMinutes: kind === 'strength' ? autoMinutes : exercise?.meta.appMinutes,
      },
      updated_at: new Date().toISOString(),
      deleted_at: null,
    }
    saveExercise(row)
    clearDraft(exercise?.id)
    onClose()
    // Sharpen the start from heart rate when Google access is already open (no sign-in prompt mid-workout).
    const token = autoTime ? cachedToken() : null
    if (token) {
      void listHeartRate(token, new Date(endMs - 3 * 3_600_000), new Date(endMs))
        .then((samples) => {
          const s0 = startFromHeartRate(samples, endMs, restingHr ?? 60)
          if (s0 != null) saveExercise({ ...row, started_at: new Date(s0).toISOString(), duration_min: Math.round((endMs - s0) / 60_000), updated_at: new Date().toISOString() })
        })
        .catch(() => {})
    }
  }

  const setLift = (i: number, change: Partial<Lift>) => setLifts((prev) => prev.map((l, j) => (j === i ? { ...l, ...change } : l)))
  const library = libraryFor(undefined, custom)
  /**
   * Picking a lift: holds and cardio pieces switch to seconds or minutes, and one you've done before starts from
   * the next step after last time (only into fields still empty).
   */
  const pickName = (i: number, name: string) => {
    const l = lifts[i]
    const known = findLift(name, library)
    const change: Partial<Lift> = known ? { name, measure: known.measure } : { name }
    const sug = suggestFromHistory(name, exercises, library, exercise?.id)
    const empty = liftWeight(l) == null && l.reps == null && l.duration == null && l.sets == null
    setLift(i, sug && empty ? { ...change, ...sug.fill, gym: l.gym } : change)
  }
  const num = (v: string) => (v === '' ? null : Number(v))
  /** Last time you did this lift (before this session), for the "last time" line and the +/- marks. */
  const prev = (l: Lift) => suggestFromHistory(l.name, exercises, library, exercise?.id)

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
      {restored && (
        <div className="notice small draft-note" role="status">
          Picked up your unsaved workout{lifts.length ? ` (${lifts.length} lift${lifts.length === 1 ? '' : 's'})` : ''}.{' '}
          <button type="button" className="link-btn" onClick={() => setRestored(false)}>
            OK
          </button>{' '}
          ·{' '}
          <button type="button" className="link-btn" onClick={discardDraft}>
            Discard it
          </button>
        </div>
      )}
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

      {autoTime ? (
        <p className="small muted auto-time">
          ⏱ Ends when you save. About {autoMinutes} min (6 per exercise), so it started around{' '}
          {new Date(Date.now() - autoMinutes * 60_000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. Fitbit's recording is
          compared when it syncs: within 10% the longer wins, otherwise you choose.
        </p>
      ) : (
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
      )}

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

      <p className={`small fitbit-kcal ${fitbitKcal == null && exercise && fitbitStatus(exercise) === 'missing' ? 'warn' : ''}`}>
        {fitbitKcal != null
          ? `🔥 ${fitbitKcal} active kcal from Fitbit.`
          : exercise && fitbitStatus(exercise) === 'missing'
            ? '⚠ Fitbit has no recording of this workout, so it has no calories. Your daily Fitbit burn still counts it.'
            : '🔥 Calories come from Fitbit once it syncs this workout (no estimate in the meantime).'}
      </p>

      {exercise && durationCheck(exercise)?.status === 'conflict' && (
        <DurationChoice e={exercise} onPick={(m) => { saveExercise(withMinutes(exercise, m, true)); onClose() }} />
      )}

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
              <input type="text" className="lift-name" aria-label="Lift" list={`lift-options-${i}`} placeholder="Lift name (tap to pick or type)" value={l.name} onChange={(e) => pickName(i, e.target.value)} />
              <LiftNameHint name={l.name} gym={l.gym} custom={custom} group={l.group} onGroup={(group) => setLift(i, { group })} onPick={(name) => pickName(i, name)} />
              <LiftPicture name={l.name} gym={l.gym} library={library} />
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
                  <span>
                    {l.measure === 'min' ? 'Level' : l.assisted ? 'Assist' : l.bells === 2 ? 'Each bell' : l.measure === 's' ? 'Weight (opt.)' : 'Weight'}
                    <Delta now={liftWeight(l)} was={prev(l)?.last.weight} />
                  </span>
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
                    <span>
                      {l.measure === 'min' ? 'Minutes' : 'Seconds'}
                      <Delta now={l.duration} was={prev(l)?.last.duration} />
                    </span>
                    <input type="number" inputMode="decimal" value={l.duration ?? ''} readOnly={!!l.setAmounts} onChange={(e) => setLift(i, { duration: num(e.target.value) })} />
                  </label>
                ) : (
                  <label>
                    <span>
                      {l.setAmounts ? 'Avg reps' : l.side === 'both' ? 'Reps (total)' : 'Reps'}
                      <Delta now={l.reps} was={prev(l)?.last.reps} />
                    </span>
                    <input type="number" inputMode="numeric" value={l.reps ?? ''} readOnly={!!l.setAmounts} onChange={(e) => setLift(i, { reps: num(e.target.value) })} />
                  </label>
                )}
                <label>
                  <span>Sets</span>
                  <input type="number" inputMode="numeric" value={l.sets ?? ''} readOnly={!!l.setAmounts} onChange={(e) => setLift(i, { sets: num(e.target.value) })} />
                </label>
              </div>
              <PerSet l={l} onChange={(next) => setLift(i, next)} />
              {prev(l) && <LastTime s={prev(l)!} />}
              <SetScore s={(l.reps != null || l.duration != null) ? scoreLiftDraft(l, exercises, library, exercise?.id, weightKg) : null} />
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
        <button type="button" className="btn" onClick={save} disabled={!(autoTime ? named.length > 0 : mins > 0)}>
          {exercise ? 'Save changes' : 'Log exercise'}
        </button>
        {(json !== opened || restored) && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              if (window.confirm(exercise ? 'Throw away your unsaved changes to this workout?' : 'Throw away this unsaved workout?')) discardDraft()
            }}
          >
            {exercise ? 'Discard changes' : 'Discard workout'}
          </button>
        )}
        {exercise && (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              deleteExercise(exercise.id)
              clearDraft(exercise.id)
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
function LiftNameHint({
  name,
  gym,
  custom,
  group,
  onGroup,
  onPick,
}: {
  name: string
  gym?: GymId
  custom: ReturnType<typeof useCustomLifts>['custom']
  group?: string
  onGroup: (group: string) => void
  onPick: (name: string) => void
}) {
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
  const guess = groupForNew(name)
  const picked = group ?? (guess === 'Other' ? '' : guess)
  // Unknown muscle: flagged so it gets picked, since the coach counts sets by muscle group.
  const unknown = !picked
  return (
    <div className={`small lift-hint ${unknown ? 'lift-flag' : 'muted'}`}>
      New lift: "{entry.name}" joins the list for {where} when you save.{' '}
      <label className="lift-group">
        {unknown ? '⚠ Which muscle does it work?' : 'Works:'}{' '}
        <select value={picked} onChange={(e) => onGroup(e.target.value)} aria-label="Muscle group">
          {unknown && <option value="">Pick one</option>}
          {LIBRARY_GROUPS.filter((g) => g !== 'Other').map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

/** The machine or its instruction panel, framed, with the muscle group and the muscles it works. */
function LiftPicture({ name, gym, library }: { name: string; gym?: GymId; library: ReturnType<typeof libraryFor> }) {
  const e = findLift(name, library)
  const [broken, setBroken] = useState(false)
  if (!e) return null
  const src = photoFor(e, gym)
  return (
    <figure className="lift-photo">
      {src && !broken && <img src={src} alt={`${e.name}: how it's done`} loading="lazy" onError={() => setBroken(true)} />}
      <figcaption>
        <span className="lift-photo-group">{e.group}</span>
        <span>{e.muscles ?? ''}</span>
        {!src && <span className="lift-photo-none">no photo yet</span>}
      </figcaption>
    </figure>
  )
}

/** What each set counts toward its muscle group: the exercise's tier × how it compares with last time. */
function SetScore({ s }: { s: ReturnType<typeof scoreLiftDraft> }) {
  if (!s || s.group === 'Cardio' || s.group === 'Other') return null
  const full = s.perSet >= 1
  return (
    <div className={`small set-score ${full ? 'full' : ''}`}>
      Each set counts <b>{s.perSet}</b> for {s.group}
      <span className="muted">
        {' '}
        · exercise {s.tier.toFixed(2).replace(/0$/, '')} × progress {s.effort.toFixed(2).replace(/0$/, '')} ({s.why})
      </span>
    </div>
  )
}

/**
 * "All sets the same" (the default). Unticked, one row per set, each starting at the first set's reps (or time) and
 * editable; the lift's reps become their average and its sets their count.
 */
function PerSet({ l, onChange }: { l: Lift; onChange: (next: Partial<Lift>) => void }) {
  const timed = isTimed(l)
  const unit = l.measure === 'min' ? 'min' : l.measure === 's' ? 's' : 'reps'
  const amounts = l.setAmounts
  const first = (timed ? l.duration : l.reps) ?? 0
  const split = () => {
    const n = Math.max(1, Math.round(l.sets ?? 4))
    onChange(withSetAmounts(l, Array.from({ length: n }, () => Math.round(first))))
  }
  const join = () => {
    const avg = (timed ? l.duration : l.reps) ?? null
    onChange({ setAmounts: undefined, ...(timed ? { duration: avg != null ? Math.round(avg) : null } : { reps: avg != null ? Math.round(avg) : null }) })
  }
  const setAt = (k: number, v: string) => {
    const next = [...amounts!]
    next[k] = v === '' ? 0 : Number(v)
    onChange(withSetAmounts(l, next))
  }
  return (
    <div className="per-set">
      <label className="check">
        <input type="checkbox" checked={!amounts} onChange={(e) => (e.target.checked ? join() : split())} /> All sets the same
      </label>
      {amounts && (
        <div className="per-set-rows">
          {amounts.map((a, k) => (
            <label key={k}>
              <span>Set {k + 1}</span>
              <input type="number" inputMode="numeric" value={a || ''} onChange={(e) => setAt(k, e.target.value)} aria-label={`Set ${k + 1} ${unit}`} />
            </label>
          ))}
          <div className="per-set-btns">
            <button type="button" className="icon-btn" aria-label="Add a set" onClick={() => onChange(withSetAmounts(l, [...amounts, amounts[amounts.length - 1] ?? first]))}>
              +
            </button>
            {amounts.length > 1 && (
              <button type="button" className="icon-btn" aria-label="Remove the last set" onClick={() => onChange(withSetAmounts(l, amounts.slice(0, -1)))}>
                −
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Fitbit's length and the app's are more than 10% apart: pick the right one. */
export function DurationChoice({ e, onPick }: { e: Exercise; onPick: (minutes: number) => void }) {
  const c = durationCheck(e)
  if (!c) return null
  return (
    <div className="notice small duration-choice" role="status">
      <b>How long was this workout?</b> Fitbit recorded {c.fitbit} min; your {e.meta.lifts?.length ?? 0} exercises suggest {c.app} min.
      <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <button type="button" className="btn small-btn" onClick={() => onPick(c.fitbit)}>
          {c.fitbit} min (Fitbit)
        </button>
        <button type="button" className="btn secondary small-btn" onClick={() => onPick(c.app)}>
          {c.app} min (my log)
        </button>
      </div>
    </div>
  )
}

/** "+5" or "−2" next to a field: the change from last time. */
function Delta({ now, was }: { now: number | null | undefined; was: number | null | undefined }) {
  if (now == null || was == null || now === was) return null
  const d = Math.round((now - was) * 100) / 100
  return <b className={`lift-delta ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? `+${d}` : `−${Math.abs(d)}`}</b>
}

/** "Last: Nov 12 · 95 lb × 10 × 4", with the coach's note for this time. */
function LastTime({ s }: { s: NonNullable<ReturnType<typeof suggestFromHistory>> }) {
  const l = s.last
  const when = new Date(`${l.day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const what =
    l.measure === 'min'
      ? `${l.duration ?? '?'} min${l.weight ? ` · level ${l.weight}` : ''}`
      : l.measure === 's'
        ? `${l.weight ? `${l.weight} ${l.unit} · ` : ''}${l.duration ?? '?'} s × ${l.sets ?? '?'}`
        : `${l.weight ? `${l.weight} ${l.unit}${l.bells === 2 ? ' ×2' : ''} · ` : ''}${l.reps ?? '?'} reps × ${l.sets ?? '?'}`
  return (
    <div className="muted small lift-last">
      Last: {when} · {what}. {s.text}
    </div>
  )
}
