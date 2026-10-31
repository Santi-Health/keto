import { useData } from '../lib/data'
import { csvFiles, download, type ExportBundle } from '../lib/exportData'
import { localDate } from '../lib/targets'
import type { Profile } from '../lib/types'

/** Download everything as JSON (full backup) or as spreadsheet-friendly CSV files. */
export function ExportCard({ profile, onOpenReport }: { profile: Profile; onOpenReport: () => void }) {
  const { foods, logs, savedMeals, exercises, readings, activity, cgmDays } = useData()
  const bundle = (): ExportBundle => ({
    exportedAt: new Date().toISOString(),
    profile,
    foods,
    foodLogs: logs,
    savedMeals,
    exercises,
    readings,
    activity: Object.values(activity).filter((a) => !a.deleted_at),
    cgmDays: Object.values(cgmDays).filter((d) => !d.deleted_at),
  })
  const stamp = localDate()
  const files = csvFiles(bundle())

  return (
    <section className="card">
      <h2>Your data</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Everything is stored in your Supabase account and on this phone. Download a copy any time.
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn" onClick={() => download(`keto-tracker-${stamp}.json`, JSON.stringify(bundle(), null, 2), 'application/json')}>
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
