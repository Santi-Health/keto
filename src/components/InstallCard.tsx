import { useInstall } from '../lib/install'

/** Install button when Chrome allows it, otherwise steps that lead to the real install. */
export function InstallCard({ compact }: { compact?: boolean }) {
  const { state, install } = useInstall()
  if (state === 'installed') {
    return compact ? null : (
      <section className="card">
        <h2>App</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Installed. You're using Santi Grial as an app.
        </p>
      </section>
    )
  }
  return (
    <section className="card">
      <h2>Install the app</h2>
      {state === 'available' ? (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Get Santi Grial on your home screen and app drawer. It opens full screen and works offline.
          </p>
          <button type="button" className="btn" onClick={() => void install()}>
            Install app
          </button>
        </>
      ) : (
        <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            Open this page in the <strong>Chrome app</strong> itself, not inside Gmail, Messages or another app. If
            you see an "Open in Chrome" option in the ⋮ menu, tap it.
          </li>
          <li>
            Tap ⋮ (top right) → <strong>Install app</strong>. On some versions it's <strong>Add to home screen</strong>,
            then choose <strong>Install</strong> (not "Create shortcut").
          </li>
          <li>If you already added a shortcut, long-press it and remove it first, then install.</li>
        </ol>
      )}
    </section>
  )
}
