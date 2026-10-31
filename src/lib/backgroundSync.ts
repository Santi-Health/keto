import { useCallback, useEffect, useState } from 'react'
import { getGoogleCode } from './googleHealth'
import { supabase } from './supabase'

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
