import { useState } from 'react'
import { supabase } from '../lib/supabase'

/** Shown instead of the app until signed in. */
export function Lock() {
  const [email, setEmail] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: passphrase })
    setBusy(false)
    if (error) {
      setMessage(
        error.status === 400 ? "That email and passphrase didn't match." : `Couldn't sign in: ${error.message}`,
      )
    }
  }

  async function forgot() {
    if (!supabase) return
    if (!email) {
      setMessage('Enter your email first, then tap "Forgot passphrase?" again.')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + import.meta.env.BASE_URL,
    })
    setMessage(error ? `Couldn't send the email: ${error.message}` : 'If that email has an account, a reset link is on its way.')
  }

  return (
    <div className="lock">
      <form className="card lock-card" onSubmit={signIn}>
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={56} height={56} />
        <h1>Santi Grial</h1>
        <p className="muted small" style={{ marginTop: 4 }}>Private. Sign in to continue.</p>
        <div className="field">
          <label htmlFor="lock-email">Email</label>
          <input id="lock-email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="lock-pass">Passphrase</label>
          <input
            id="lock-pass"
            type="password"
            required
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </div>
        <button type="submit" className="btn" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Unlock'}
        </button>
        <button type="button" className="link" onClick={forgot}>
          Forgot passphrase?
        </button>
        {message && <p className="small" role="status" style={{ marginBottom: 0 }}>{message}</p>}
      </form>
    </div>
  )
}

/** Shown on the published site if it was built without the Supabase settings. */
export function NotConfigured() {
  return (
    <div className="lock">
      <div className="card lock-card">
        <h1>Santi Grial</h1>
        <p className="muted small" style={{ marginBottom: 0 }}>
          This app isn't connected to its database yet. Add the Supabase settings to the GitHub repository and redeploy.
        </p>
      </div>
    </div>
  )
}
