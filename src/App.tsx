import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { DataProvider, useData } from './lib/data'
import { averageBurn } from './lib/activity'
import { useSyncOnOpen } from './lib/backgroundSync'
import { recordZone } from './lib/time'
import { fillFood, fillLog, fillRecipe, needsVitamins } from './lib/vitaminFill'
import { latest } from './lib/readings'
import type { Profile } from './lib/types'
import { useProfile, useSession } from './lib/profileStore'
import { computeTargets, localDate } from './lib/targets'
import { supabase } from './lib/supabase'
import { Add } from './screens/Add'
import { Lock, NotConfigured } from './screens/Lock'
import { Coach } from './screens/Coach'
import { Log } from './screens/Log'
import { Report } from './screens/Report'
import { Settings } from './screens/Settings'
import { Today } from './screens/Today'
import { CustomLiftsContext, type LibraryExercise } from './lib/library'

type Tab = 'today' | 'log' | 'add' | 'coach' | 'settings' | 'report'

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'today', label: 'Today', icon: icon('M12 3a9 9 0 1 0 9 9M12 3v9l6 3') },
  { id: 'log', label: 'Log', icon: icon('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01') },
  { id: 'add', label: 'Add', icon: icon('M12 5v14M5 12h14') },
  { id: 'coach', label: 'Coach', icon: icon('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z') },
  { id: 'settings', label: 'Settings', icon: icon('M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4') },
]

/** Routes look like #log/2026-10-29 or #add/scan: a tab plus an optional detail, and a part to jump to (#log/2026-10-29/lunch). */
const getRoute = (): { tab: Tab; param: string | null; focus: string | null } => {
  const [raw, param = null, focus = null] = window.location.hash.slice(1).split('/') as [string, string?, string?]
  // Insights became Coach; old links and bookmarks still land somewhere useful.
  const tab = (raw === 'insights' ? 'coach' : raw) as Tab
  return TABS.some((t) => t.id === tab) || tab === 'report' ? { tab, param, focus } : { tab: 'today', param: null, focus: null }
}

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

export default function App() {
  const { session, recovering, doneRecovering } = useSession()

  // The published site must always be locked; local development may run without a database.
  if (!supabase) return import.meta.env.PROD ? <NotConfigured /> : <Tracker session={null} />
  if (session === undefined) return null
  if (!session) return <Lock />
  return <Tracker session={session} recovering={recovering} onPassphraseChanged={doneRecovering} />
}

interface TrackerProps {
  session: Session | null
  recovering?: boolean
  onPassphraseChanged?: () => void
}

function Tracker({ session, recovering = false, onPassphraseChanged = () => {} }: TrackerProps) {
  const { profile, update, sync } = useProfile(session)
  const [{ tab, param, focus }, setRoute] = useState(getRoute)
  const targets = useMemo(() => computeTargets(profile, new Date(), profile.fitbitBurnKcal ?? null), [profile])
  const customLifts = useMemo(
    () => ({
      custom: profile.customLifts ?? [],
      add: (entries: LibraryExercise[]) => entries.length && update({ customLifts: [...(profile.customLifts ?? []), ...entries] }),
    }),
    [profile.customLifts, update],
  )

  useEffect(() => {
    const onHash = () => setRoute(getRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // A reset-passphrase link lands here; send them to the form that finishes it.
  useEffect(() => {
    if (recovering) window.location.hash = 'settings'
  }, [recovering])

  useEffect(() => {
    if (profile.theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.dataset.theme = profile.theme
  }, [profile.theme])

  const go = (hash: string) => {
    window.location.hash = hash
    window.scrollTo(0, 0)
  }

  return (
    <DataProvider session={session}>
    <CustomLiftsContext.Provider value={customLifts}>
    <WeightFromReadings weightKg={profile.weightKg} lastId={profile.weightReadingId ?? null} update={update} />
    <BurnFromActivity kcal={profile.fitbitBurnKcal ?? null} update={update} />
    <SyncOnOpen enabled={!!session} />
    <ZoneTracker log={profile.zoneLog} update={update} />
    <VitaminFiller />
    <div className="app">
      <main className="main">
        {tab === 'today' && (
          <Today
            profile={profile}
            targets={targets}
            onOpenSettings={() => go('settings')}
            onToggleRefeed={() => update({ refeedDate: targets.isRefeed ? null : localDate() })}
            onNavigate={go}
            onUpdateProfile={update}
          />
        )}
        {tab === 'settings' && (
          <Settings
            profile={profile}
            update={update}
            targets={targets}
            session={session}
            sync={sync}
            recovering={recovering}
            onPassphraseChanged={onPassphraseChanged}
          />
        )}
        {tab === 'log' && (
          <Log
            weightKg={profile.weightKg}
            hr={{ age: targets.age, sex: profile.sex, bmrPerDay: targets.bmr }}
            weightUnit={profile.weightUnit}
            netCarbLimit={targets.netCarbsG}
            proteinTarget={targets.proteinG}
            date={isDate(param) ? param : localDate()}
            focus={focus}
            onDateChange={(d) => go(d === localDate() ? 'log' : `log/${d}`)}
            onAdd={(d) => go(d === localDate() ? 'add' : `add/${d}`)}
          />
        )}
        {tab === 'add' && (
          <Add
            key={param ?? ''}
            startScan={param === 'scan'}
            startClaude={param === 'claude'}
            date={isDate(param) ? param : undefined}
            waterTargetOz={profile.waterOz}
            onLogged={() => go(isDate(param) ? `log/${param}` : 'today')}
          />
        )}
        {tab === 'report' && (
          <Report
            profile={profile}
            targets={targets}
            days={param === '7' || param === '90' ? (Number(param) as 7 | 90) : 30}
            onRange={(d) => go(`report/${d}`)}
            onBack={() => go('coach')}
          />
        )}
        {tab === 'coach' && (
          <Coach
            profile={profile}
            targets={targets}
            weightUnit={profile.weightUnit}
            onApplyLimit={(g) => update({ netCarbLimitG: g })}
            onOpenReport={(days) => go(`report/${days}`)}
          />
        )}
      </main>
      <nav className="nav no-print" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={tab === t.id || (tab === 'report' && t.id === 'coach') ? 'page' : undefined} onClick={() => go(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
    </CustomLiftsContext.Provider>
    </DataProvider>
  )
}

/** A newly logged weight becomes the profile weight, so targets follow it. Editing Settings still works until the next weigh-in. */
function WeightFromReadings({ weightKg, lastId, update }: { weightKg: number; lastId: string | null; update: (p: Partial<Profile>) => void }) {
  const { readings } = useData()
  const w = latest(readings, 'weight')
  const key = w ? `${w.id}@${w.taken_at}@${w.value}` : null
  useEffect(() => {
    if (!w?.value || key === lastId) return
    update({ weightKg: Math.round(w.value * 100) / 100, weightReadingId: key })
  }, [key, lastId, w?.value, weightKg, update])
  return null
}

/** Keeps the profile's Fitbit burn in step with the last 7 full days of imported activity. */
function BurnFromActivity({ kcal, update }: { kcal: number | null; update: (p: Partial<Profile>) => void }) {
  const { activity } = useData()
  const burn = averageBurn(Object.values(activity).filter((d) => !d.deleted_at), localDate())
  useEffect(() => {
    if (burn && burn.kcal !== kcal) update({ fitbitBurnKcal: burn.kcal, fitbitBurnDays: burn.days })
  }, [burn?.kcal, burn?.days, kcal, update])
  return null
}

/** Asks the server for a fresh Fitbit / Google Health sync when the app opens (if background sync is linked). */
function SyncOnOpen({ enabled }: { enabled: boolean }) {
  useSyncOnOpen(enabled)
  return null
}

/** Notes the phone's time zone when the app opens or comes back, so travel days can be recognized. */
function ZoneTracker({ log, update }: { log: Profile['zoneLog']; update: (p: Partial<Profile>) => void }) {
  useEffect(() => {
    const check = () => {
      const next = recordZone(log)
      if (next) update({ zoneLog: next })
    }
    check()
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [log, update])
  return null
}

let vitaminRunStarted = false

/**
 * Once per app session, quietly fills in vitamins for foods that don't have them yet (a few at a time,
 * one USDA lookup each), then for recipes built from them, then for logged meals.
 */
function VitaminFiller() {
  const { foods, foodById, logs, updateFood, updateLog } = useData()
  useEffect(() => {
    if (vitaminRunStarted || !foods.length || !navigator.onLine) return
    vitaminRunStarted = true
    void (async () => {
      const updated: Record<string, typeof foods[number]> = { ...foodById }
      for (const f of foods.filter(needsVitamins).slice(0, 30)) {
        try {
          const filled = await fillFood(f)
          updateFood(filled)
          updated[f.id] = filled
        } catch {
          break // USDA busy or offline: try again next time the app opens
        }
      }
      for (const r of Object.values(updated).filter((f) => f.source === 'recipe' && !f.deleted_at)) {
        const filled = fillRecipe(r, updated)
        if (filled) {
          updateFood(filled)
          updated[r.id] = filled
        }
      }
      for (const l of logs) {
        const filled = fillLog(l, l.food_id ? updated[l.food_id] : undefined)
        if (filled) updateLog(filled)
      }
    })()
  }, [foods, foodById, logs, updateFood, updateLog])
  return null
}
