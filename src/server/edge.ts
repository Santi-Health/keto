/**
 * Supabase Edge Function "health-sync" (bundled into supabase/functions/health-sync/index.js by `npm run build:sync`).
 *   POST …/health-sync/run     every 4 hours from pg_cron (no sign-in; recently synced users are skipped)
 *   POST …/health-sync/link    from the app: { code, tz } with the app's sign-in token
 *   POST …/health-sync/unlink  from the app, with the app's sign-in token
 *   POST …/health-sync/sync-me from the app when it opens (skipped if synced in the last 10 minutes)
 * Deploy with "Enforce JWT verification" off, since the scheduled call has no sign-in.
 */
import { link, runAll, syncMe, unlink, type Env } from './sync'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void }

const GOOGLE_CLIENT_ID = '579706392010-f9v75bfl95tcgbuftcvodajimck9dv37.apps.googleusercontent.com'
const ALLOWED_ORIGINS = ['https://santi-health.github.io', 'http://localhost:5174']

function env(): Env {
  const get = (k: string) => {
    const v = Deno.env.get(k)
    if (!v) throw new Error(`Missing setting ${k} in Supabase Edge Function secrets.`)
    return v
  }
  // Projects on the new API keys get them as JSON maps; older ones as single legacy keys.
  const fromMap = (k: string) => {
    try {
      const m = JSON.parse(Deno.env.get(k) ?? '{}') as Record<string, string>
      return m.default ?? Object.values(m)[0]
    } catch {
      return undefined
    }
  }
  const serviceKey = fromMap('SUPABASE_SECRET_KEYS') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = fromMap('SUPABASE_PUBLISHABLE_KEYS') ?? Deno.env.get('SUPABASE_ANON_KEY')
  if (!serviceKey || !anonKey) throw new Error('Supabase keys are not available to the function.')
  return {
    supabaseUrl: get('SUPABASE_URL'),
    serviceKey,
    anonKey,
    googleClientId: GOOGLE_CLIENT_ID,
    googleClientSecret: get('GOOGLE_CLIENT_SECRET'),
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') ?? ''
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const path = new URL(req.url).pathname.replace(/\/+$/, '')
  try {
    if (path.endsWith('/run')) return json({ ok: true, results: (await runAll(env())).map((r) => r.result) })
    const appJwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (path.endsWith('/link')) {
      const { code, tz } = (await req.json()) as { code?: string; tz?: string }
      if (!code) return json({ error: 'Missing code' }, 400)
      return json({ ok: true, result: await link(env(), appJwt, code, tz || 'America/Los_Angeles') })
    }
    if (path.endsWith('/sync-me')) {
      const { tz } = (await req.json().catch(() => ({}))) as { tz?: string }
      return json({ ok: true, ...(await syncMe(env(), appJwt, tz)) })
    }
    if (path.endsWith('/unlink')) {
      await unlink(env(), appJwt)
      return json({ ok: true })
    }
    return json({ error: 'Not found' }, 404)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
