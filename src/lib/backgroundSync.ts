import { useCallback, useEffect, useState } from 'react'
import { googleLinkUrl, linkRedirectUri } from './googleHealth'
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

async function call(path: string, body: unknown) {
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
}

/** The random check sent to Google, and Google's answer as google-link.html saved it. */
const STATE_KEY = 'keto.googleLink.state'
const RESULT_KEY = 'keto.googleLink.result'
/** An answer older than this is from an abandoned attempt. */
const RESULT_MAX_AGE_MS = 15 * 60_000

export interface LinkResult {
  code: string | null
  error: string | null
  state: string | null
  at: number
}

/** What to do with Google's answer: send the code, show an error, or nothing (stale or not ours). */
export function readLinkResult(r: LinkResult | null, state: string | null, now = Date.now()): { code: string } | { error: string } | null {
  if (!r || now - r.at > RESULT_MAX_AGE_MS) return null
  if (!state || r.state !== state) return { error: "Google's answer didn't match this link attempt. Tap Re-link Google again." }
  if (r.error) return { error: r.error === 'access_denied' ? 'Google access was not allowed.' : `Google said: ${r.error}.` }
  if (!r.code) return { error: 'Google sent no code. Tap Re-link Google again.' }
  return { code: r.code }
}

let finishing: Promise<string> | null = null

/** Sends Google's one-time code to the server, once. Null when there's no answer from Google waiting. */
function finishLinkFromRedirect(): Promise<string> | null {
  if (finishing) return finishing
  let r: LinkResult | null = null
  let state: string | null = null
  try {
    r = JSON.parse(localStorage.getItem(RESULT_KEY) ?? 'null') as LinkResult | null
    state = localStorage.getItem(STATE_KEY)
    // Used once, whatever happens next.
    localStorage.removeItem(RESULT_KEY)
    localStorage.removeItem(STATE_KEY)
  } catch {
    return null
  }
  const next = readLinkResult(r, state)
  if (!next) return null
  finishing = ('error' in next ? Promise.reject(new Error(next.error)) : call('link', { code: next.code, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, redirect_uri: linkRedirectUri() }))
    .then((j) => `Linked. First sync done: ${j.result}. Pull down or reopen the app to see it.`)
    .catch((e: Error) => `Couldn't link: ${e.message}`)
  return finishing
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

  // Back from Google's consent page: finish linking (once, however many cards are showing).
  useEffect(() => {
    const p = finishLinkFromRedirect()
    if (!p) return
    setBusy(true)
    setMessage('Finishing the Google link…')
    p.then(setMessage).finally(() => {
      setBusy(false)
      void refresh()
    })
  }, [refresh])

  /** Opens Google's consent page in this tab; Google brings you back to Settings and the link finishes there. */
  const link = useCallback(async () => {
    setBusy(true)
    setMessage(null)
    const state = crypto.randomUUID()
    try {
      localStorage.setItem(STATE_KEY, state)
      localStorage.removeItem(RESULT_KEY)
    } catch {
      setBusy(false)
      setMessage("Couldn't link: this browser blocks storage the link needs.")
      return
    }
    window.location.assign(googleLinkUrl(state))
  }, [])

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
  }, [refresh])

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
          body: JSON.stringify({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
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
