import { describe, expect, it } from 'vitest'
import { readLinkResult } from './backgroundSync'
import { googleLinkUrl, linkRedirectUri } from './googleHealth'
import { LINK_REDIRECTS } from '../server/sync'

describe('re-linking Google by redirect', () => {
  const now = 1_000_000_000
  const r = (o: Partial<{ code: string | null; error: string | null; state: string | null; at: number }>) => ({ code: 'c1', error: null, state: 's1', at: now, ...o })

  it('sends the code only when the check matches this attempt', () => {
    expect(readLinkResult(r({}), 's1', now)).toEqual({ code: 'c1' })
    expect(readLinkResult(r({}), 'other', now)).toHaveProperty('error')
    expect(readLinkResult(r({}), null, now)).toHaveProperty('error')
  })

  it('reports a refusal and ignores stale or missing answers', () => {
    expect(readLinkResult(r({ code: null, error: 'access_denied' }), 's1', now)).toEqual({ error: 'Google access was not allowed.' })
    expect(readLinkResult(r({ at: now - 20 * 60_000 }), 's1', now)).toBeNull()
    expect(readLinkResult(null, 's1', now)).toBeNull()
  })

  it("asks Google for offline access and returns to a page the server accepts", () => {
    const uri = linkRedirectUri('https://santi-health.github.io', '/keto/')
    expect(LINK_REDIRECTS).toContain(uri)
    const u = new URL(googleLinkUrl('s1', uri))
    expect(u.searchParams.get('redirect_uri')).toBe(uri)
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('state')).toBe('s1')
    expect(u.searchParams.get('scope')).toContain('drive.file')
  })
})
