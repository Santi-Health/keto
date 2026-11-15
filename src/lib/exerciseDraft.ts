import { useEffect, useState } from 'react'
import type { Lift } from './exercise'

/**
 * A workout being logged, kept on the device as it's typed so leaving the sheet (or the app) doesn't lose it.
 * One draft for a new session, and one per session being edited. Saving or discarding clears it.
 */
export interface ExerciseDraft {
  kind: string
  cardioType: string
  yogaStyle: string
  distance: string
  floors: string
  level: string
  minutes: string
  intensity: string
  start: string
  fasted: boolean
  note: string
  lifts: Lift[]
  kcalText: string
  savedAt: string
}

/** A draft older than this is from another day's session, so it's dropped. */
const MAX_AGE_MS = 18 * 3_600_000
export const DRAFT_EVENT = 'keto:exercise-draft'

const key = (id?: string) => `keto.exerciseDraft.${id ?? 'new'}`

export function loadDraft(id?: string): ExerciseDraft | null {
  try {
    const raw = localStorage.getItem(key(id))
    if (!raw) return null
    const d = JSON.parse(raw) as ExerciseDraft
    if (Date.now() - Date.parse(d.savedAt) > MAX_AGE_MS) {
      localStorage.removeItem(key(id))
      return null
    }
    return d
  } catch {
    return null
  }
}

export function saveDraft(id: string | undefined, d: Omit<ExerciseDraft, 'savedAt'>) {
  try {
    localStorage.setItem(key(id), JSON.stringify({ ...d, savedAt: new Date().toISOString() }))
    window.dispatchEvent(new Event(DRAFT_EVENT))
  } catch {
    // Only a convenience; the sheet still works.
  }
}

export function clearDraft(id?: string) {
  try {
    localStorage.removeItem(key(id))
    window.dispatchEvent(new Event(DRAFT_EVENT))
  } catch {
    // Nothing to clear.
  }
}

/** The unsaved new workout, kept current as the sheet saves it or clears it. */
export function useNewDraft(): ExerciseDraft | null {
  const [d, setD] = useState(() => loadDraft())
  useEffect(() => {
    const on = () => setD(loadDraft())
    window.addEventListener(DRAFT_EVENT, on)
    document.addEventListener('visibilitychange', on)
    return () => {
      window.removeEventListener(DRAFT_EVENT, on)
      document.removeEventListener('visibilitychange', on)
    }
  }, [])
  return d
}
