import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Chrome fires this once, possibly before React mounts, so catch it at module load.
let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallPromptEvent
  listeners.forEach((l) => l())
})
window.addEventListener('appinstalled', () => {
  deferred = null
  listeners.forEach((l) => l())
})

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export type InstallState = 'installed' | 'available' | 'unavailable'

/** Whether the app can be installed right now, and a function that opens Chrome's install dialog. */
export function useInstall() {
  const get = (): InstallState => (isStandalone() ? 'installed' : deferred ? 'available' : 'unavailable')
  const [state, setState] = useState<InstallState>(get)
  useEffect(() => {
    const update = () => setState(get())
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])

  const install = async () => {
    if (!deferred) return false
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    deferred = null
    setState(get())
    return outcome === 'accepted'
  }
  return { state, install }
}
