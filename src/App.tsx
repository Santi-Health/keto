import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useProfile, useSession } from './lib/profileStore'
import { computeTargets } from './lib/targets'
import { supabase } from './lib/supabase'
import { Lock, NotConfigured } from './screens/Lock'
import { Settings } from './screens/Settings'
import { Today } from './screens/Today'

type Tab = 'today' | 'log' | 'add' | 'trends' | 'settings'

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'today', label: 'Today', icon: icon('M12 3a9 9 0 1 0 9 9M12 3v9l6 3') },
  { id: 'log', label: 'Log', icon: icon('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01') },
  { id: 'add', label: 'Add', icon: icon('M12 5v14M5 12h14') },
  { id: 'trends', label: 'Trends', icon: icon('M3 17l6-6 4 4 8-8M15 7h6v6') },
  { id: 'settings', label: 'Settings', icon: icon('M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4') },
]

const COMING: Record<Exclude<Tab, 'today' | 'settings'>, { title: string; text: string }> = {
  log: { title: 'Log', text: 'Your daily timeline of meals, readings and exercise arrives in phase 2.' },
  add: { title: 'Add food', text: 'Search, barcode scan, label photos and saved meals arrive in phases 2–4.' },
  trends: { title: 'Trends', text: 'Charts for weight, macros, ketones and glucose arrive in phase 8.' },
}

const getTab = (): Tab => {
  const hash = window.location.hash.slice(1) as Tab
  return TABS.some((t) => t.id === hash) ? hash : 'today'
}

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
  const [tab, setTab] = useState<Tab>(getTab)
  const targets = useMemo(() => computeTargets(profile), [profile])

  useEffect(() => {
    const onHash = () => setTab(getTab())
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

  const go = (t: Tab) => {
    window.location.hash = t
    window.scrollTo(0, 0)
  }

  return (
    <div className="app">
      <main className="main">
        {tab === 'today' && <Today targets={targets} onOpenSettings={() => go('settings')} />}
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
        {tab !== 'today' && tab !== 'settings' && (
          <>
            <header className="page-header">
              <h1>{COMING[tab].title}</h1>
            </header>
            <div className="card empty">
              <p className="muted" style={{ margin: 0 }}>{COMING[tab].text}</p>
            </div>
          </>
        )}
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
  )
}
