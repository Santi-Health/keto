import { relinkDueIn, useBackgroundSync } from '../lib/backgroundSync'

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** Settings card: turn on background sync (every 4 hours), see its status, re-link or turn it off. */
export function BackgroundSyncCard() {
  const { status, busy, message, link, unlink } = useBackgroundSync()
  const linked = !!status?.linked_at && !status.needs_relink
  const due = relinkDueIn(status)
  return (
    <section className="card">
      <div className="page-header" style={{ marginBottom: 6 }}>
        <h2>Background sync</h2>
        <span className={`badge ${linked ? 'ok' : status?.needs_relink ? 'warn' : ''}`}>{linked ? 'On' : status?.needs_relink ? 'Needs re-link' : 'Off'}</span>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Every 4 hours, even with the app closed, your Supabase server pulls Fitbit workouts, steps, sleep, heart rate and HRV, weigh-ins and Lingo
        glucose, and saves the weekly Google Drive backup. Google limits personal (testing) apps to about a week of background access, so the app
        reminds you to re-link with one tap.
      </p>
      {status?.last_sync_at && (
        <p className="small" style={{ margin: '0 0 6px' }}>
          Last sync <b>{when(status.last_sync_at)}</b>
          {status.last_result ? `: ${status.last_result}` : ''}.
        </p>
      )}
      {status?.last_error && <p className="notice small">{status.last_error}</p>}
      {linked && due != null && (
        <p className="muted small" style={{ margin: '0 0 6px' }}>
          {due > 1 ? `Re-link due in about ${Math.floor(due)} days.` : 'Re-link due today.'}
        </p>
      )}
      {message && <p className="notice small">{message}</p>}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn" disabled={busy} onClick={() => void link()}>
          {busy ? 'Working…' : linked ? 'Re-link Google now' : status?.needs_relink ? 'Re-link Google' : 'Link Google for background sync'}
        </button>
        {(linked || status?.needs_relink) && (
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void unlink()}>
            Turn off
          </button>
        )}
      </div>
    </section>
  )
}

/** One-line reminder on Today when Google's weekly limit is up (or about to be). */
export function RelinkBanner() {
  const { status, busy, message, link } = useBackgroundSync()
  const due = relinkDueIn(status)
  if (!status?.linked_at && !status?.needs_relink) return null
  if (!status.needs_relink && (due == null || due > 1)) return null
  return (
    <div className="notice small" role="status">
      {status.needs_relink ? 'Background sync is paused: Google needs its weekly OK.' : 'Background sync needs its weekly Google OK today.'}{' '}
      <button type="button" className="link-btn" disabled={busy} onClick={() => void link()}>
        {busy ? 'Linking…' : 'Re-link Google'}
      </button>
      {message && <div>{message}</div>}
    </div>
  )
}
