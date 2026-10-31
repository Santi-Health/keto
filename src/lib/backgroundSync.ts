import { useCallback, useEffect, useState } from 'react'
import { getGoogleCode } from './googleHealth'
import { supabase } from './supabase'
import { REFRESH_EVENT } from './syncTable'

/** What the app shows about background sync (the Google token itself never leaves the server). */
export interface SyncStatus {
  linked_at: string | null
  time_zone: string
  last_sync_at: string | null
  last_result: string | null
  last_error: string | null
  needs_relink: boolean
}

/** Google lets testing-mode apps keep background access for about 7 days. */
const LINK_DAYS = 7

const fnUrl = (path: string) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/health-sync/${path}`

export function relinkDueIn(s: SyncStatus | null, now = Date.now()): number | null {
  if (!s?.linked_at) return null
  return LINK_DAYS - (now - Date.parse(s.linked_at)) / 86_400_000
}

export function useBackgroundSync() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.from('sync_status').select('linked_at,time_zone,last_sync_at,last_result,last_error,needs_relink').maybeSingle()
    setStatus((data as SyncStatus | null) ?? null)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const call = useCallback(async (path: string, body: unknown) => {
    const session = (await supabase?.auth.getSession())?.data.session
    if (!session) throw new Error('Sign in to the app first.')
    const res = await fetch(fnUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
      body: JSON.stringify(body),
    })
    const j = (await res.json().catch(() => ({}))) as { error?: string; result?: string }
    if (!res.ok) throw new Error(j.error ?? `Background sync service returned ${res.status}.`)
    return j
  }, [])

  /** Must run from a tap: opens Google's consent popup. */
  const link = useCallback(async () => {
    setBusy(true)
    setMessage(null)
    try {
      const code = await getGoogleCode(true)
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const r = await call('link', { code, tz })
      setMessage(`Linked. First sync done: ${r.result}. Pull down or reopen the app to see it.`)
    } catch (e) {
      setMessage(`Couldn't link: ${(e as Error).message}`)
    } finally {
      setBusy(false)
      void refresh()
    }
  }, [call, refresh])

  const unlink = useCallback(async () => {
    setBusy(true)
    try {
      await call('unlink', {})
      setMessage('Background sync is off. Google access was removed.')
    } catch (e) {
      setMessage(`Couldn't unlink: ${(e as Error).message}`)
    } finally {
      setBusy(false)
      void refresh()
    }
  }, [call, refresh])

  return { status, busy, message, link, unlink, refresh }
}

// --- Sync when the app opens --------------------------------------------------------------

/** Opening or returning to the app after this long asks the server for a fresh sync. */
const OPEN_SYNC_AFTER_MS = 15 * 60_000

type OpenSyncState = { running: boolean; message: string | null }
let openState: OpenSyncState = { running: false, message: null }
const listeners = new Set<(s: OpenSyncState) => void>()
const setOpenState = (s: OpenSyncState) => {
  openState = s
  for (const l of listeners) l(s)
}

/** Whether an on-open sync is running right now (for a small "Updating…" note). */
export function useOpenSyncState(): OpenSyncState {
  const [s, setS] = useState(openState)
  useEffect(() => {
    listeners.add(setS)
    return () => void listeners.delete(setS)
  }, [])
  return s
}

let lastAttempt = 0

/**
 * When the app opens or comes back to the foreground, asks the server to sync Fitbit / Google Health
 * now (if background sync is linked and the last sync is over 15 minutes old), then pulls the new rows in.
 */
export function useSyncOnOpen(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !supabase) return
    const run = async () => {
      if (document.visibilityState !== 'visible' || openState.running || Date.now() - lastAttempt < OPEN_SYNC_AFTER_MS) return
      lastAttempt = Date.now()
      const session = (await supabase!.auth.getSession()).data.session
      if (!session) return
      const { data } = await supabase!.from('sync_status').select('linked_at,last_sync_at,needs_relink').maybeSingle()
      const st = data as Pick<SyncStatus, 'linked_at' | 'last_sync_at' | 'needs_relink'> | null
      if (!st?.linked_at || st.needs_relink) return
      if (st.last_sync_at && Date.now() - Date.parse(st.last_sync_at) < OPEN_SYNC_AFTER_MS) return
      setOpenState({ running: true, message: null })
      try {
        const res = await fetch(fnUrl('sync-me'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
          body: '{}',
        })
        const j = (await res.json().catch(() => ({}))) as { ran?: boolean; result?: string; error?: string }
        if (j.ran) window.dispatchEvent(new Event(REFRESH_EVENT))
        setOpenState({ running: false, message: res.ok ? null : (j.error ?? null) })
      } catch {
        // Offline or the server is busy: the 4-hour schedule still runs.
        setOpenState({ running: false, message: null })
      }
    }
    void run()
    const onVisible = () => void run()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [enabled])
}
