import { describe, expect, it } from 'vitest'
import { EXERCISE_LIBRARY, libraryFor } from './library'

describe('exercise library', () => {
  it('has unique ids', () => {
    const ids = EXERCISE_LIBRARY.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('filters by gym and always includes exercises that work anywhere', () => {
    const mp2 = libraryFor('MP2').map((e) => e.id)
    expect(mp2).toContain('kbswing')
    expect(mp2).toContain('lunge')
    expect(mp2).not.toContain('legext')
  })
  it('returns everything when no gym is chosen', () => {
    expect(libraryFor().length).toBe(EXERCISE_LIBRARY.length)
  })
})
