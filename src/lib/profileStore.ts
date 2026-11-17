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

async function pushProfile(profile: Profile) {
  if (!supabase) return
  const { error } = await supabase
    .from('profiles')
    .upsert({ data: profile, updated_at: profile.updatedAt })
  if (error) throw error
}

/** Profile fields changed on this device that the server hasn't received yet. */
const DIRTY_KEY = 'keto.profile.dirty'

function loadDirty(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DIRTY_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function saveDirty(keys: string[]) {
  try {
    if (keys.length) localStorage.setItem(DIRTY_KEY, JSON.stringify(keys))
    else localStorage.removeItem(DIRTY_KEY)
  } catch {
    // Ignore; worst case a change is merged as a whole profile.
  }
}

/**
 * The server copy with this device's unsent changes laid on top, field by field. So a change made elsewhere
 * (another device, or a direct database edit) survives an automatic update here, like a new weigh-in.
 */
export function mergeProfile(remote: Profile, local: Profile, dirty: string[]): Profile {
  const merged: Profile = { ...DEFAULT_PROFILE, ...remote }
  for (const k of dirty) (merged as unknown as Record<string, unknown>)[k] = (local as unknown as Record<string, unknown>)[k]
  return merged
}

export type SyncState = 'local-only' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error'

/**
 * Profile kept in localStorage first (works offline), mirrored to Supabase when signed in.
 * The server copy is read when the app opens or comes back to the foreground; changes made here that haven't
 * reached the server yet are kept on top of it.
 */
export function useProfile(session: Session | null) {
  const [profile, setProfile] = useState<Profile>(loadLocal)
  const [sync, setSync] = useState<SyncState>(supabase ? 'signed-out' : 'local-only')

  /** Pull the server copy, merge this device's unsent changes, and push the result if there were any. */
  const syncNow = useCallback(async () => {
    if (!supabase || !session) return
    setSync('syncing')
    try {
      const { data, error } = await supabase.from('profiles').select('data, updated_at').maybeSingle()
      if (error) throw error
      const local = loadLocal()
      const dirty = loadDirty()
      if (!data) {
        await pushProfile(local)
      } else {
        const remote = { ...DEFAULT_PROFILE, ...(data.data as Profile), updatedAt: data.updated_at as string }
        const merged = dirty.length ? { ...mergeProfile(remote, local, dirty), updatedAt: new Date().toISOString() } : remote
        saveLocal(merged)
        setProfile(merged)
        if (dirty.length) {
          await pushProfile(merged)
          // A change made while sending keeps its marks and goes with the next sync.
          if (loadLocal().updatedAt === merged.updatedAt) saveDirty([])
        }
      }
      setSync('synced')
    } catch {
      setSync(navigator.onLine ? 'error' : 'offline')
    }
  }, [session])

  useEffect(() => {
    if (!supabase || !session) {
      setSync(supabase ? 'signed-out' : 'local-only')
      return
    }
    void syncNow()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow()
    }
    const onOnline = () => void syncNow()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [session, syncNow])

  // Debounced so typing in a field doesn't send one request per keystroke.
  const pushTimer = useRef<number | undefined>(undefined)
  const update = useCallback(
    (changes: Partial<Profile>) => {
      // Built on the stored copy, not this render's, so a server copy pulled a moment ago isn't undone.
      const next = { ...loadLocal(), ...changes, updatedAt: new Date().toISOString() }
      saveDirty([...new Set([...loadDirty(), ...Object.keys(changes)])])
      saveLocal(next)
      setProfile(next)
      if (supabase && session) {
        setSync('syncing')
        window.clearTimeout(pushTimer.current)
        pushTimer.current = window.setTimeout(() => void syncNow(), 800)
      }
    },
    [session, syncNow],
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
