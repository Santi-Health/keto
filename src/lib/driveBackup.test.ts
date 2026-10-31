import { afterEach, describe, expect, it, vi } from 'vitest'
import { backupDue, backupToDrive } from './driveBackup'

afterEach(() => vi.unstubAllGlobals())

describe('Drive backup', () => {
  it('is due after a week, or when never done', () => {
    const now = Date.parse('2026-11-08T12:00:00Z')
    expect(backupDue(null, now)).toBe(true)
    expect(backupDue('2026-11-02T12:00:00Z', now)).toBe(false)
    expect(backupDue('2026-11-01T12:00:00Z', now)).toBe(true)
  })

  it('reuses the folder, uploads the file and trashes all but the newest 8', async () => {
    const calls: { url: string; method: string; body?: string }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, method: init.method ?? 'GET', body: init.body as string | undefined })
        const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 })
        if (url.includes('/files/folder1?')) return json({ id: 'folder1', trashed: false })
        if (url.includes('uploadType=multipart')) return json({ id: 'new' })
        if (url.includes('in%20parents')) return json({ files: Array.from({ length: 10 }, (_, i) => ({ id: `f${i}` })) })
        return json({ id: 'x' })
      }),
    )
    const r = await backupToDrive('tok', '{"a":1}', 'keto-tracker-2026-11-08.json', 'folder1')
    expect(r).toMatchObject({ folderId: 'folder1', trashed: 2 })
    const upload = calls.find((c) => c.url.includes('uploadType=multipart'))!
    expect(upload.body).toContain('"parents":["folder1"]')
    expect(upload.body).toContain('{"a":1}')
    const trashed = calls.filter((c) => c.method === 'PATCH').map((c) => c.url.match(/files\/(\w+)/)![1])
    expect(trashed).toEqual(['f8', 'f9'])
  })
})
