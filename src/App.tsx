import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { DataProvider } from './lib/data'
import { useProfile, useSession } from './lib/profileStore'
import { computeTargets, localDate } from './lib/targets'
import { supabase } from './lib/supabase'
import { Add } from './screens/Add'
import { Lock, NotConfigured } from './screens/Lock'
import { Insights } from './screens/Insights'
import { Log } from './screens/Log'
import { Settings } from './screens/Settings'
import { Today } from './screens/Today'

type Tab = 'today' | 'log' | 'add' | 'insights' | 'settings'

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'today', label: 'Today', icon: icon('M12 3a9 9 0 1 0 9 9M12 3v9l6 3') },
  { id: 'log', label: 'Log', icon: icon('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01') },
  { id: 'add', label: 'Add', icon: icon('M12 5v14M5 12h14') },
  { id: 'insights', label: 'Insights', icon: icon('M3 17l6-6 4 4 8-8M15 7h6v6') },
  { id: 'settings', label: 'Settings', icon: icon('M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4') },
]

/** Routes look like #log/2026-10-29 or #add/scan: a tab plus an optional detail. */
const getRoute = (): { tab: Tab; param: string | null } => {
  const [tab, param = null] = window.location.hash.slice(1).split('/') as [Tab, string?]
  return TABS.some((t) => t.id === tab) ? { tab, param } : { tab: 'today', param: null }
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
  const [{ tab, param }, setRoute] = useState(getRoute)
  const targets = useMemo(() => computeTargets(profile), [profile])

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
    <div className="app">
      <main className="main">
        {tab === 'today' && (
          <Today
            profile={profile}
            targets={targets}
            onOpenSettings={() => go('settings')}
            onToggleRefeed={() => update({ refeedDate: targets.isRefeed ? null : localDate() })}
            onNavigate={go}
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
            date={isDate(param) ? param : localDate()}
            onDateChange={(d) => go(d === localDate() ? 'log' : `log/${d}`)}
            onAdd={(d) => go(d === localDate() ? 'add' : `add/${d}`)}
          />
        )}
        {tab === 'add' && (
          <Add
            key={param ?? ''}
            startScan={param === 'scan'}
            date={isDate(param) ? param : undefined}
            onLogged={() => go(isDate(param) ? `log/${param}` : 'today')}
          />
        )}
        {tab === 'insights' && <Insights />}
      </main>
      <nav className="nav" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
    </DataProvider>
  )
}
