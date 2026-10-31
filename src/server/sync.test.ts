import { afterEach, describe, expect, it, vi } from 'vitest'
import { localDateIn, runAll, splitScopes, tzOffsetMs } from './sync'

afterEach(() => vi.unstubAllGlobals())

describe('server time zones', () => {
  it('knows Pacific time, including daylight saving', () => {
    expect(tzOffsetMs('America/Los_Angeles', Date.parse('2026-07-01T12:00:00Z'))).toBe(-7 * 3_600_000)
    expect(tzOffsetMs('America/Los_Angeles', Date.parse('2026-12-01T12:00:00Z'))).toBe(-8 * 3_600_000)
  })

  it('gives the local date even when UTC has already rolled over', () => {
    // 11 PM in California on Oct 30 is already Oct 31 in UTC.
    expect(localDateIn('America/Los_Angeles', Date.parse('2026-10-31T06:00:00Z'))).toBe('2026-10-30')
  })
})

describe('scheduled run', () => {
  const env = { supabaseUrl: 'https://x.supabase.co', serviceKey: 's', anonKey: 'a', googleClientId: 'c', googleClientSecret: 'g' }

  it('skips users synced recently, and flags expired Google access for re-linking', async () => {
    const writes: { url: string; body: string }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
        if (url.includes('/google_tokens?select')) return json([{ user_id: 'u1', refresh_token: 'r1', scopes: '' }, { user_id: 'u2', refresh_token: 'r2', scopes: '' }])
        if (url.includes('/sync_status?select'))
          return json([
            { user_id: 'u1', time_zone: 'America/Los_Angeles', last_sync_at: new Date().toISOString() },
            { user_id: 'u2', time_zone: 'America/Los_Angeles', last_sync_at: null },
          ])
        if (url.includes('oauth2.googleapis.com/token')) return json({ error: 'invalid_grant' }, 400)
        if (init.method === 'POST' || init.method === 'DELETE') {
          writes.push({ url, body: String(init.body ?? '') })
          return new Response('', { status: 201 })
        }
        return json([])
      }),
    )
    const out = await runAll(env)
    expect(out[0].result).toBe('skipped: synced recently')
    expect(out[1].result).toMatch(/expired/)
    expect(writes.some((w) => w.url.includes('sync_status') && w.body.includes('"needs_relink":true'))).toBe(true)
    expect(writes.some((w) => w.url.includes('google_tokens?user_id=eq.u2'))).toBe(true)
  })
})

describe('scopes', () => {
  it('keeps Drive out of the health token, since Google Health rejects mixed tokens', () => {
    const granted = 'openid https://www.googleapis.com/auth/googlehealth.sleep.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly'
    const s = splitScopes(granted)
    expect(s.health).toBe('https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly https://www.googleapis.com/auth/googlehealth.sleep.readonly')
    expect(s.drive).toBe('https://www.googleapis.com/auth/drive.file')
    expect(splitScopes('https://www.googleapis.com/auth/googlehealth.sleep.readonly').drive).toBeNull()
  })
})
