import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Window event that makes every synced table pull from the server now. */
export const REFRESH_EVENT = 'keto:refresh'

export interface SyncedRow {
  id: string
  updated_at: string
  deleted_at: string | null
}

interface Stored<T> {
  rows: Record<string, T>
  dirty: string[]
  /** Latest server updated_at seen, for pulling only what changed. */
  lastPull: string | null
}

const load = <T,>(key: string): Stored<T> => {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch {
    // Unavailable or corrupt storage starts empty.
  }
  return { rows: {}, dirty: [], lastPull: null }
}

const save = <T,>(key: string, s: Stored<T>) => {
  try {
    localStorage.setItem(key, JSON.stringify(s))
  } catch {
    // Storage full or unavailable; the cloud copy still syncs while online.
  }
}

/**
 * A table kept on the device first and mirrored to Supabase when signed in.
 * Edits are queued while offline and pushed when the connection returns; deletes are soft
 * (deleted_at) so they reach other devices too.
 */
export function useSyncedTable<T extends SyncedRow>(table: string, session: Session | null) {
  const key = `keto.table.${table}`
  const [state, setState] = useState<Stored<T>>(() => load<T>(key))
  const stateRef = useRef(state)
  const [error, setError] = useState<string | null>(null)
  const pushing = useRef(false)
  /** True once this session has caught up with the server. */
  const [pulled, setPulled] = useState(false)

  const commit = useCallback(
    (next: Stored<T>) => {
      stateRef.current = next
      save(key, next)
      setState(next)
    },
    [key],
  )

  const push = useCallback(async () => {
    if (!supabase || !session || pushing.current) return
    const { rows, dirty } = stateRef.current
    if (!dirty.length) return
    pushing.current = true
    try {
      // updated_at is set by the database, so it isn't sent.
      const payload = dirty.filter((id) => rows[id]).map((id) => {
        const { updated_at: _skip, ...rest } = rows[id] as T & Record<string, unknown>
        void _skip
        return rest
      })
      // Rows pulled from the cloud carry user_id and new ones don't. defaultToNull: false lets a new row in a mixed
      // batch take the column default (your account) instead of null, which the owner-only rule rejects.
      const { data, error: err } = await supabase.from(table).upsert(payload, { defaultToNull: false }).select('id, updated_at')
      if (err) throw err
      const now = stateRef.current
      const nextRows = { ...now.rows }
      for (const r of data ?? []) if (nextRows[r.id]) nextRows[r.id] = { ...nextRows[r.id], updated_at: r.updated_at }
      // Keep anything edited again while this push was in flight.
      const pushed = new Set(dirty)
      const stillDirty = now.dirty.filter((id) => !pushed.has(id) || now.rows[id] !== rows[id])
      commit({ ...now, rows: nextRows, dirty: stillDirty })
      setError(null)
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : null)
    } finally {
      pushing.current = false
    }
  }, [commit, session, table])

  const pull = useCallback(async () => {
    if (!supabase || !session) return
    // Pages of 1000, oldest change first, until caught up.
    for (;;) {
      let query = supabase.from(table).select('*').order('updated_at').limit(1000)
      if (stateRef.current.lastPull) query = query.gt('updated_at', stateRef.current.lastPull)
      const { data, error: err } = await query
      if (err) {
        setError(navigator.onLine ? err.message : null)
        return
      }
      if (!data?.length) return setPulled(true)
      const now = stateRef.current
      const dirty = new Set(now.dirty)
      const rows = { ...now.rows }
      for (const r of data as T[]) {
        if (!dirty.has(r.id)) rows[r.id] = r // local unsynced edits win; they're pushed next
      }
      commit({ ...now, rows, lastPull: (data[data.length - 1] as T).updated_at })
      if (data.length < 1000) return setPulled(true)
    }
  }, [commit, session, table])

  // Sync on sign-in, when the app comes back to the foreground, and when the network returns.
  useEffect(() => {
    if (!session) return
    const sync = () => void push().then(pull)
    sync()
    const onVisible = () => document.visibilityState === 'visible' && sync()
    window.addEventListener('online', sync)
    // Fired after the server has synced new Fitbit/Google Health data in (see backgroundSync.ts).
    window.addEventListener(REFRESH_EVENT, sync)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(REFRESH_EVENT, sync)
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [session, push, pull])

  const pushTimer = useRef<number | undefined>(undefined)
  const upsert = useCallback(
    (row: T) => {
      const now = stateRef.current
      commit({
        ...now,
        rows: { ...now.rows, [row.id]: { ...row, updated_at: new Date().toISOString() } },
        dirty: now.dirty.includes(row.id) ? now.dirty : [...now.dirty, row.id],
      })
      window.clearTimeout(pushTimer.current)
      pushTimer.current = window.setTimeout(() => void push(), 600)
    },
    [commit, push],
  )

  const remove = useCallback(
    (id: string) => {
      const row = stateRef.current.rows[id]
      if (row) upsert({ ...row, deleted_at: new Date().toISOString() })
    },
    [upsert],
  )

  const rows = Object.values(state.rows).filter((r) => !r.deleted_at)
  return { rows, byId: state.rows, upsert, remove, pending: state.dirty.length, error, pulled }
}
