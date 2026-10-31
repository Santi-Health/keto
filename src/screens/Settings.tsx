import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { NumberField, Segmented } from '../components/Fields'
import { BackgroundSyncCard } from '../components/BackgroundSyncCard'
import { ExportCard } from '../components/ExportCard'
import { InstallCard } from '../components/InstallCard'
import type { SyncState } from '../lib/profileStore'
import { supabase } from '../lib/supabase'
import { ACTIVITY_FACTORS, CM_PER_IN, MAX_DEFICIT, kgToLb, lbToKg, type Targets } from '../lib/targets'
import type { ActivityLevel, Profile } from '../lib/types'
import { WATCH_LIST, type WatchKey } from '../lib/watchlist'
import { DEFAULT_YOGA_ROUTINE, YOGA_STYLES, type YogaStyle } from '../lib/exercise'

interface Props {
  profile: Profile
  update: (changes: Partial<Profile>) => void
  targets: Targets
  session: Session | null
  sync: SyncState
  recovering: boolean
  onPassphraseChanged: () => void
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function Settings({ profile, update, targets, session, sync, recovering, onPassphraseChanged }: Props) {
  const weightDisplay = profile.weightUnit === 'lb' ? round1(kgToLb(profile.weightKg)) : round1(profile.weightKg)
  const totalIn = profile.heightCm != null ? profile.heightCm / CM_PER_IN : null

  return (
    <>
      <header className="page-header">
        <h1>Settings</h1>
      </header>

      <div className="grid two">
        <div className="grid">
          <section className="card">
            <h2>About you</h2>
            <div className="field">
              <label htmlFor="report-name">Name (only for the doctor summary)</label>
              <input id="report-name" type="text" value={profile.reportName ?? ''} onChange={(e) => update({ reportName: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="birth">Birth date</label>
              <input
                id="birth"
                type="date"
                value={profile.birthDate}
                onChange={(e) => e.target.value && update({ birthDate: e.target.value })}
              />
              <div className="hint">Age {targets.age}</div>
            </div>

            <Segmented
              label="Sex (for the calorie formula)"
              value={profile.sex}
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'unspecified', label: 'Prefer not to say' },
              ]}
              onChange={(sex) => update({ sex })}
            />

            <Segmented
              label="Height unit"
              value={profile.heightUnit}
              options={[
                { value: 'cm', label: 'cm' },
                { value: 'ftin', label: 'ft / in' },
              ]}
              onChange={(heightUnit) => update({ heightUnit })}
            />
            {profile.heightUnit === 'cm' ? (
              <NumberField
                label="Height"
                value={profile.heightCm != null ? round1(profile.heightCm) : null}
                suffix="cm"
                min={100}
                max={230}
                onChange={(heightCm) => update({ heightCm })}
              />
            ) : (
              <div className="row">
                <NumberField
                  label="Height (feet)"
                  value={totalIn != null ? Math.floor(totalIn / 12) : null}
                  suffix="ft"
                  onChange={(ft) => update({ heightCm: (ft * 12 + (totalIn != null ? totalIn % 12 : 0)) * CM_PER_IN })}
                />
                <NumberField
                  label="Inches"
                  value={totalIn != null ? round1(totalIn % 12) : null}
                  suffix="in"
                  onChange={(inch) =>
                    update({ heightCm: ((totalIn != null ? Math.floor(totalIn / 12) : 5) * 12 + inch) * CM_PER_IN })
                  }
                />
              </div>
            )}

            <Segmented
              label="Weight unit"
              value={profile.weightUnit}
              options={[
                { value: 'lb', label: 'lb' },
                { value: 'kg', label: 'kg' },
              ]}
              onChange={(weightUnit) => update({ weightUnit })}
            />
            <NumberField
              label="Current weight"
              value={weightDisplay}
              suffix={profile.weightUnit}
              step={0.1}
              hint="Updates automatically when you log a weigh-in under Readings."
              onChange={(w) => update({ weightKg: profile.weightUnit === 'lb' ? lbToKg(w) : w })}
            />

            <div className="field">
              <label htmlFor="activity">Activity level</label>
              <select
                id="activity"
                value={profile.activityLevel}
                onChange={(e) => update({ activityLevel: e.target.value as ActivityLevel })}
              >
                {Object.entries(ACTIVITY_FACTORS).map(([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="hint">Only used until Fitbit is connected. Then your real daily burn is used.</div>
            </div>
          </section>

          <section className="card">
            <h2>Targets</h2>
            <NumberField
              label="Net carb limit"
              value={profile.netCarbLimitG}
              suffix="g / day"
              min={5}
              max={100}
              hint="Starting value. After ~2 weeks of blood ketone readings the app will recommend a personal limit."
              onChange={(netCarbLimitG) => update({ netCarbLimitG })}
            />
            <NumberField
              label="Protein per pound of body weight"
              value={profile.proteinPerLb}
              suffix="g / lb"
              step={0.05}
              min={0.5}
              max={1.5}
              onChange={(proteinPerLb) => update({ proteinPerLb })}
            />
            <div className="field">
              <label htmlFor="deficit">Calorie deficit: {Math.round(profile.deficitPct * 100)}%</label>
              <input
                id="deficit"
                type="range"
                min={0}
                max={MAX_DEFICIT}
                step={0.01}
                value={profile.deficitPct}
                onChange={(e) => update({ deficitPct: Number(e.target.value) })}
              />
              <div className="hint">
                For losing fat while keeping muscle, 10–15% is a common range. Capped at {MAX_DEFICIT * 100}%.
              </div>
            </div>
            <Segmented
              label="Muscle goal (sets leucine per meal)"
              value={profile.muscleGoal}
              options={[
                { value: 'maintain', label: 'Maintain (2.5 g)' },
                { value: 'build', label: 'Build (3 g)' },
              ]}
              onChange={(muscleGoal) => update({ muscleGoal })}
            />
            <NumberField
              label="Daily calorie ceiling"
              value={profile.calorieCapKcal}
              suffix="kcal"
              step={50}
              min={1200}
              hint="Your target never goes above this, except on refeed days (mark one from the Today screen). Set 0 to turn the ceiling off."
              onChange={(n) => update({ calorieCapKcal: n > 0 ? n : null })}
            />
            <div className="row">
              <NumberField label="Sodium" value={profile.sodiumMg} suffix="mg" step={100} onChange={(sodiumMg) => update({ sodiumMg })} />
              <NumberField label="Potassium" value={profile.potassiumMg} suffix="mg" step={100} onChange={(potassiumMg) => update({ potassiumMg })} />
            </div>
            <div className="row">
              <NumberField label="Magnesium" value={profile.magnesiumMg} suffix="mg" step={10} onChange={(magnesiumMg) => update({ magnesiumMg })} />
              <NumberField label="Fiber" value={profile.fiberG} suffix="g" onChange={(fiberG) => update({ fiberG })} />
            </div>
            <NumberField label="Water" value={profile.waterOz / 8} step={0.5} suffix="cups (8 oz) / day" onChange={(cups) => update({ waterOz: cups * 8 })} />
            <p className="muted small" style={{ margin: 0 }}>
              Electrolyte defaults follow common keto guidance (sodium 3,000–5,000 mg, potassium 3,500–4,700 mg, magnesium
              300–500 mg). This is general guidance, not medical advice.
            </p>
          </section>
        </div>

        <div className="grid">
          <InstallCard />
          <RoutineCard profile={profile} update={update} />
          <TargetMath profile={profile} targets={targets} />
          <WatchSettingsCard profile={profile} update={update} targets={targets} />
          <BackgroundSyncCard />

          <ExportCard profile={profile} update={update} onOpenReport={() => (window.location.hash = 'report/30')} />

          <Account session={session} sync={sync} recovering={recovering} onPassphraseChanged={onPassphraseChanged} />
          <section className="card">
            <h2>Appearance</h2>
            <Segmented
              label="Theme"
              value={profile.theme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onChange={(theme) => update({ theme })}
            />
          </section>
        </div>
      </div>
    </>
  )
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function RoutineCard({ profile, update }: Pick<Props, 'profile' | 'update'>) {
  const r = profile.yogaRoutine
  const set = (change: Partial<NonNullable<Profile['yogaRoutine']>>) => update({ yogaRoutine: { ...(r ?? DEFAULT_YOGA_ROUTINE), ...change } })
  return (
    <section className="card">
      <h2>Yoga routine</h2>
      <label className="check">
        <input type="checkbox" checked={!!r} onChange={(e) => update({ yogaRoutine: e.target.checked ? DEFAULT_YOGA_ROUTINE : null })} />
        Show a one-tap "Log usual yoga" button on these days
      </label>
      {r && (
        <>
          <div className="field">
            <span className="label">Days</span>
            <div className="chips">
              {DAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  className={`chip-btn ${r.days.includes(i) ? 'on' : ''}`}
                  aria-pressed={r.days.includes(i)}
                  aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]}
                  onClick={() => set({ days: r.days.includes(i) ? r.days.filter((x) => x !== i) : [...r.days, i].sort() })}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="yr-start">Starts</label>
              <input id="yr-start" type="time" value={r.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
            </div>
            <NumberField label="Minutes" value={r.minutes} onChange={(minutes) => set({ minutes })} />
          </div>
          <div className="field">
            <label htmlFor="yr-style">Style</label>
            <select id="yr-style" value={r.yogaStyle ?? 'flow'} onChange={(e) => set({ yogaStyle: e.target.value as YogaStyle })}>
              {YOGA_STYLES.map((y) => (
                <option key={y.value} value={y.value}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </section>
  )
}

function WatchSettingsCard({ profile, update, targets }: Pick<Props, 'profile' | 'update' | 'targets'>) {
  const ctx = { calorieTarget: targets.calories, weightKg: profile.weightKg }
  const set = (key: WatchKey, change: { enabled?: boolean; limit?: number | null }) =>
    update({ watchList: { ...profile.watchList, [key]: { ...profile.watchList[key], ...change } } })
  return (
    <section className="card">
      <h2>Watch list</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Turn items on or off and change limits. Leave a limit empty to go back to the default.
      </p>
      {(Object.keys(WATCH_LIST) as WatchKey[]).map((key) => {
        const def = WATCH_LIST[key]
        const s = profile.watchList[key] ?? {}
        const enabled = s.enabled !== false
        const defaultLimit = def.limit(ctx)
        return (
          <div key={key} className="watch-row" style={{ alignItems: 'center' }}>
            <label className="check" style={{ margin: 0, flex: 1 }} title={def.guidance}>
              <input type="checkbox" checked={enabled} onChange={(e) => set(key, { enabled: e.target.checked })} />
              <span>
                {def.label}
                <span className="muted small"> {def.period === 'week' ? '/ week' : '/ day'}</span>
              </span>
            </label>
            {(defaultLimit != null || s.limit != null) && (
              <span className="row" style={{ flex: '0 0 130px' }}>
                <input
                  type="number"
                  inputMode="decimal"
                  aria-label={`${def.label} limit`}
                  disabled={!enabled}
                  placeholder={defaultLimit != null ? String(defaultLimit) : ''}
                  value={s.limit ?? ''}
                  onChange={(e) => {
                    const { limit: _drop, ...rest } = profile.watchList[key] ?? {}
                    void _drop
                    if (e.target.value === '') update({ watchList: { ...profile.watchList, [key]: rest } })
                    else set(key, { limit: Number(e.target.value) })
                  }}
                  style={{ minHeight: 36, padding: '4px 8px' }}
                />
                <span className="muted small" style={{ flex: '0 0 auto' }}>{def.unit}</span>
              </span>
            )}
          </div>
        )
      })}
      <p className="muted small" style={{ marginBottom: 0 }}>
        Purines and arsenic are not tracked yet; they need data the food databases don't provide.
      </p>
    </section>
  )
}

function TargetMath({ profile, targets }: { profile: Profile; targets: Targets }) {
  const fmt = (n: number | null, unit = '') => (n == null ? '—' : `${n.toLocaleString()}${unit}`)
  return (
    <section className="card">
      <h2>How your targets are calculated</h2>
      <table className="calc">
        <tbody>
          <tr>
            <td>Resting burn (Mifflin-St Jeor)</td>
            <td>{fmt(targets.bmr, ' kcal')}</td>
          </tr>
          <tr>
            <td>× activity factor {ACTIVITY_FACTORS[profile.activityLevel].factor}</td>
            <td>{fmt(targets.estimatedBurn, ' kcal')}</td>
          </tr>
          <tr>
            <td>
              {targets.isRefeed ? 'Refeed day: no deficit' : `− ${Math.round(profile.deficitPct * 100)}% deficit`}
              {targets.burnSource === 'fitbit' && <div className="muted small">using Fitbit burn {fmt(targets.burn)}</div>}
            </td>
            <td>
              {fmt(
                targets.burn != null
                  ? Math.round(targets.burn * (1 - (targets.isRefeed ? 0 : Math.min(profile.deficitPct, MAX_DEFICIT))))
                  : null,
                ' kcal',
              )}
            </td>
          </tr>
          <tr>
            <td>
              Calorie target
              {targets.capped && <div className="muted small">limited by your {profile.calorieCapKcal?.toLocaleString()} kcal ceiling</div>}
              {targets.isRefeed && profile.calorieCapKcal != null && <div className="muted small">ceiling lifted for today's refeed</div>}
            </td>
            <td>{fmt(targets.calories, ' kcal')}</td>
          </tr>
          <tr>
            <td>Protein: {round1(kgToLb(profile.weightKg))} lb × {profile.proteinPerLb} g</td>
            <td>{targets.proteinG} g</td>
          </tr>
          <tr>
            <td>Net carbs (limit)</td>
            <td>{targets.netCarbsG} g</td>
          </tr>
          <tr>
            <td>
              Fat budget: calories left ÷ 9
              <div className="muted small">
                not a goal; shrinks if you eat more protein · minimum {fmt(targets.fatMinG, ' g')} (20% of calories)
              </div>
            </td>
            <td>{fmt(targets.fatG, ' g')}</td>
          </tr>
        </tbody>
      </table>
      {targets.warnings.length > 0 && (
        <p className="notice" style={{ marginBottom: 0 }}>
          {targets.warnings.join(' ')}
        </p>
      )}
    </section>
  )
}

const SYNC_LABEL: Record<SyncState, { text: string; tone: '' | 'ok' | 'warn' }> = {
  'local-only': { text: 'This device only', tone: 'warn' },
  'signed-out': { text: 'Not signed in', tone: 'warn' },
  syncing: { text: 'Syncing…', tone: '' },
  synced: { text: 'Synced', tone: 'ok' },
  offline: { text: 'Offline, will sync later', tone: 'warn' },
  error: { text: 'Sync error', tone: 'warn' },
}

function Account({ session, sync, recovering, onPassphraseChanged }: AccountProps) {
  const [passphrase, setPassphrase] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const label = SYNC_LABEL[sync]

  async function changePassphrase(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    if (passphrase.length < 10) {
      setStatus('Use at least 10 characters. A few random words works well.')
      return
    }
    setStatus('Saving…')
    const { error } = await supabase.auth.updateUser({ password: passphrase })
    if (error) {
      setStatus(`Couldn't change it: ${error.message}`)
    } else {
      setPassphrase('')
      setStatus('Passphrase changed.')
      onPassphraseChanged()
    }
  }

  return (
    <section className="card" id="account">
      <div className="page-header" style={{ marginBottom: 12 }}>
        <h2>Account &amp; sync</h2>
        <span className={`badge ${label.tone}`}>{label.text}</span>
      </div>
      {!supabase || !session ? (
        <p className="muted small" style={{ margin: 0 }}>
          Cloud sync isn't set up yet, so data is saved on this device only. Follow the Supabase steps in the README to
          turn it on.
        </p>
      ) : (
        <>
          <p className="small" style={{ marginTop: 0 }}>
            Signed in as <strong>{session.user.email}</strong>
          </p>
          <form onSubmit={changePassphrase}>
            {recovering && <p className="notice">Choose a new passphrase to finish resetting it.</p>}
            <div className="field">
              <label htmlFor="new-pass">{recovering ? 'New passphrase' : 'Change passphrase'}</label>
              <input
                id="new-pass"
                type="password"
                autoComplete="new-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button type="submit" className="btn">
                Save passphrase
              </button>
              <button type="button" className="btn secondary" onClick={() => supabase!.auth.signOut()}>
                Sign out
              </button>
            </div>
            {status && <p className="small" role="status">{status}</p>}
          </form>
        </>
      )}
    </section>
  )
}

interface AccountProps {
  session: Session | null
  sync: SyncState
  recovering: boolean
  onPassphraseChanged: () => void
}
