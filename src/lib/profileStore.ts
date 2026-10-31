import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { DEFAULT_PROFILE, type Profile } from './types'

const STORAGE_KEY = 'keto.profile'

function loadLocal(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_PROFILE, ...JSON.parse(raw) }
  } catch {
    // Storage unavailable or corrupt; fall back to defaults.
  }
  return DEFAULT_PROFILE
}

function saveLocal(profile: Profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Ignore; the in-memory profile still works for this visit.
  }
}

export type SyncState = 'local-only' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error'

async function pushProfile(profile: Profile) {
  if (!supabase) return
  const { error } = await supabase
    .from('profiles')
    .upsert({ data: profile, updated_at: profile.updatedAt })
  if (error) throw error
}

/**
 * Profile kept in localStorage first (works offline), mirrored to Supabase when signed in.
 * On sign-in, whichever copy was edited last wins.
 */
export function useProfile(session: Session | null) {
  const [profile, setProfile] = useState<Profile>(loadLocal)
  const [sync, setSync] = useState<SyncState>(supabase ? 'signed-out' : 'local-only')

  useEffect(() => {
    if (!supabase || !session) {
      setSync(supabase ? 'signed-out' : 'local-only')
      return
    }
    let cancelled = false
    setSync('syncing')
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('data, updated_at')
          .maybeSingle()
        if (error) throw error
        const local = loadLocal()
        if (data && new Date(data.updated_at) > new Date(local.updatedAt)) {
          const remote = { ...DEFAULT_PROFILE, ...(data.data as Profile) }
          if (!cancelled) {
            saveLocal(remote)
            setProfile(remote)
          }
        } else {
          await pushProfile(local)
        }
        if (!cancelled) setSync('synced')
      } catch {
        if (!cancelled) setSync(navigator.onLine ? 'error' : 'offline')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session])

  // Retry pushing once the connection comes back.
  useEffect(() => {
    if (!supabase || !session) return
    const onOnline = () => {
      setSync('syncing')
      pushProfile(loadLocal()).then(
        () => setSync('synced'),
        () => setSync('error'),
      )
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [session])

  // Debounced so typing in a field doesn't send one request per keystroke.
  const pushTimer = useRef<number | undefined>(undefined)
  const update = useCallback(
    (changes: Partial<Profile>) => {
      const next = { ...profile, ...changes, updatedAt: new Date().toISOString() }
      saveLocal(next)
      setProfile(next)
      if (supabase && session) {
        setSync('syncing')
        window.clearTimeout(pushTimer.current)
        pushTimer.current = window.setTimeout(() => {
          pushProfile(next).then(
            () => setSync('synced'),
            () => setSync(navigator.onLine ? 'error' : 'offline'),
          )
        }, 800)
      }
    },
    [profile, session],
  )

  return { profile, update, sync }
}

/**
 * Current sign-in. `session` is undefined while it's still being checked.
 * `recovering` is true after opening a "reset passphrase" email link.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)
  const [recovering, setRecovering] = useState(false)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  return { session, recovering, doneRecovering: () => setRecovering(false) }
}
