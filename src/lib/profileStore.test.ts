import { describe, expect, it } from 'vitest'
import { mergeProfile } from './profileStore'
import { DEFAULT_PROFILE, type Profile } from './types'

describe('mergeProfile', () => {
  const yoga = { kind: 'mobility' as const, days: [1, 2, 3, 5], start: '12:05', times: { 2: '11:05' }, minutes: 50 }
  const remote = { ...DEFAULT_PROFILE, weightKg: 80, yogaRoutine: yoga } as Profile
  const stale = { ...DEFAULT_PROFILE, weightKg: 79.4, yogaRoutine: { ...yoga, days: [1, 3, 5], times: {} } } as Profile

  it('keeps a server-side change when only an automatic field changed here', () => {
    const m = mergeProfile(remote, stale, ['weightKg'])
    expect(m.weightKg).toBe(79.4)
    expect(m.yogaRoutine?.days).toEqual([1, 2, 3, 5])
    expect(m.yogaRoutine?.times?.[2]).toBe('11:05')
  })

  it('keeps a change made here to the same field', () => {
    expect(mergeProfile(remote, stale, ['yogaRoutine']).yogaRoutine?.days).toEqual([1, 3, 5])
  })

  it('takes the server copy when nothing is unsent', () => {
    expect(mergeProfile(remote, stale, [])).toMatchObject({ weightKg: 80 })
  })
})
