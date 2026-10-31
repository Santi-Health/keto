import { useCallback, useState } from 'react'
import { useData } from './data'
import { backupToDrive } from './driveBackup'
import type { ExportBundle } from './exportData'
import { DRIVE_SCOPE, getGoogleToken } from './googleHealth'
import { localDate } from './targets'
import type { Profile } from './types'

/** Builds the full backup and saves it to Google Drive, remembering when and where. */
export function useBackup(profile: Profile, update: (p: Partial<Profile>) => void) {
  const { foods, logs, savedMeals, exercises, readings, activity, cgmDays } = useData()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const bundle = useCallback(
    (): ExportBundle => ({
      exportedAt: new Date().toISOString(),
      profile,
      foods,
      foodLogs: logs,
      savedMeals,
      exercises,
      readings,
      activity: Object.values(activity).filter((a) => !a.deleted_at),
      cgmDays: Object.values(cgmDays).filter((d) => !d.deleted_at),
    }),
    [profile, foods, logs, savedMeals, exercises, readings, activity, cgmDays],
  )

  /** Pass a Drive token when one is already at hand; otherwise this asks Google (must run from a tap). */
  const backUp = useCallback(
    async (token?: string): Promise<string> => {
      setBusy(true)
      setMessage(null)
      try {
        const t = token ?? (await getGoogleToken(false, DRIVE_SCOPE))
        const r = await backupToDrive(t, JSON.stringify(bundle()), `keto-tracker-${localDate()}.json`, profile.backupFolderId)
        update({ lastBackupAt: new Date().toISOString(), backupFolderId: r.folderId })
        const msg = `Backed up to Google Drive → “Keto Tracker backups” / ${r.fileName} (${Math.round(r.bytes / 1024)} KB).`
        setMessage(msg)
        return msg
      } catch (e) {
        const msg = `Backup didn't finish: ${(e as Error).message}`
        setMessage(msg)
        throw new Error(msg)
      } finally {
        setBusy(false)
      }
    },
    [bundle, profile.backupFolderId, update],
  )

  return { bundle, backUp, busy, message }
}
