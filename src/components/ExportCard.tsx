import { csvFiles, download } from '../lib/exportData'
import { BACKUP_FOLDER, KEEP_BACKUPS } from '../lib/driveBackup'
import { localDate } from '../lib/targets'
import type { Profile } from '../lib/types'
import { useBackup } from '../lib/useBackup'

/** Weekly Google Drive backup, plus downloads as JSON (full backup) or spreadsheet-friendly CSV files. */
export function ExportCard({ profile, update, onOpenReport }: { profile: Profile; update: (p: Partial<Profile>) => void; onOpenReport: () => void }) {
  const { bundle, backUp, busy, message } = useBackup(profile, update)
  const stamp = localDate()
  const files = csvFiles(bundle())

  return (
    <section className="card">
      <h2>Your data</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Everything is stored in your Supabase account and on this phone. A full copy also goes to Google Drive (“{BACKUP_FOLDER}”) once a week when you import
        from Fitbit; the newest {KEEP_BACKUPS} are kept.
      </p>
      <p className="small" style={{ marginTop: 0 }}>
        Last Drive backup:{' '}
        <b>{profile.lastBackupAt ? new Date(profile.lastBackupAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never'}</b>
      </p>
      {message && <p className="notice small">{message}</p>}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn" disabled={busy} onClick={() => void backUp().catch(() => {})}>
          {busy ? 'Backing up…' : 'Back up to Google Drive now'}
        </button>
        <button type="button" className="btn secondary" onClick={() => download(`keto-tracker-${stamp}.json`, JSON.stringify(bundle(), null, 2), 'application/json')}>
          Download everything (JSON)
        </button>
        <button type="button" className="btn secondary" onClick={onOpenReport}>
          Doctor summary (PDF)
        </button>
      </div>
      <div className="section-label">Spreadsheets (CSV)</div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {Object.entries(files).map(([name, text]) => (
          <button key={name} type="button" className="chip-btn" onClick={() => download(name.replace('.csv', `-${stamp}.csv`), text)}>
            {name.replace('.csv', '')} ({text.trim().split('\n').length - 1})
          </button>
        ))}
      </div>
    </section>
  )
}
