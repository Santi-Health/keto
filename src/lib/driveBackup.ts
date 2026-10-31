/**
 * Weekly backup of everything (the same JSON as "Download everything") to a "Keto Tracker backups"
 * folder in Google Drive. Uses the drive.file permission, which only reaches files this app creates.
 * Web apps can't run in the background, so it runs when a Google sign-in is already at hand
 * (the Fitbit import) or when you tap "Back up now". The newest 8 backups are kept; older ones go to Drive's trash.
 */

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
export const BACKUP_FOLDER = 'Keto Tracker backups'
export const KEEP_BACKUPS = 8
const WEEK_MS = 7 * 86_400_000

export const backupDue = (lastBackupAt: string | null | undefined, now = Date.now()) =>
  !lastBackupAt || now - Date.parse(lastBackupAt) >= WEEK_MS

async function drive<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })
  if (res.status === 401) throw new Error('Google sign-in expired. Try again.')
  if (res.status === 403) {
    const body = await res.text().catch(() => '')
    throw new Error(
      /insufficient|scope/i.test(body) ? 'Google needs your OK to save backups to Drive. Tap again and allow it.' : `Google Drive refused the backup. ${body.slice(0, 200)}`,
    )
  }
  if (!res.ok) throw new Error(`Google Drive returned ${res.status}. ${(await res.text().catch(() => '')).slice(0, 200)}`)
  return res.json() as Promise<T>
}

/** Finds the backup folder this app made earlier, or creates it. */
async function ensureFolder(token: string, knownId?: string | null): Promise<string> {
  if (knownId) {
    try {
      const f = await drive<{ id: string; trashed?: boolean }>(token, `${DRIVE}/files/${knownId}?fields=id,trashed`)
      if (!f.trashed) return f.id
    } catch {
      // Gone or not visible any more: look it up or make a new one.
    }
  }
  const q = encodeURIComponent(`name='${BACKUP_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const found = await drive<{ files: { id: string }[] }>(token, `${DRIVE}/files?q=${q}&fields=files(id)&spaces=drive`)
  if (found.files[0]) return found.files[0].id
  const made = await drive<{ id: string }>(token, `${DRIVE}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: BACKUP_FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
  })
  return made.id
}

export interface BackupResult {
  folderId: string
  fileName: string
  bytes: number
  trashed: number
}

export async function backupToDrive(token: string, json: string, fileName: string, folderId?: string | null): Promise<BackupResult> {
  const folder = await ensureFolder(token, folderId)
  const boundary = `keto${Date.now()}`
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: fileName, parents: [folder], mimeType: 'application/json' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    json +
    `\r\n--${boundary}--`
  await drive(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  // Keep the newest backups; older ones go to Drive's trash (recoverable there for 30 days).
  const q = encodeURIComponent(`'${folder}' in parents and trashed=false`)
  const list = await drive<{ files: { id: string }[] }>(token, `${DRIVE}/files?q=${q}&orderBy=createdTime desc&fields=files(id)&pageSize=100`)
  const old = list.files.slice(KEEP_BACKUPS)
  for (const f of old) {
    await drive(token, `${DRIVE}/files/${f.id}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    })
  }
  return { folderId: folder, fileName, bytes: json.length, trashed: old.length }
}
