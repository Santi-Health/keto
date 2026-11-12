import { describe, expect, it } from 'vitest'
import { EXERCISE_LIBRARY, findLift, libraryFor, newLibraryEntries, suggestLift, tidyLiftName } from './library'

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

describe('new lifts', () => {
  it('suggests the list entry for a typo or reordered words', () => {
    expect(suggestLift('Kettlebell swnig', EXERCISE_LIBRARY)?.id).toBe('kbswing')
    expect(suggestLift('assisted pullup', EXERCISE_LIBRARY)?.id).toBe('assistpu')
    expect(suggestLift('Kettlebell swing', EXERCISE_LIBRARY)).toBeNull()
    expect(suggestLift('Bulgarian split squat', EXERCISE_LIBRARY)).toBeNull()
  })
  it('tidies names and finds them ignoring case', () => {
    expect(tidyLiftName('  cable   fly ')).toBe('Cable fly')
    expect(findLift('PUSH-UP', EXERCISE_LIBRARY)?.id).toBe('pushup')
  })
  it('puts free weights in every gym and machines only in theirs', () => {
    const [kb, cable] = newLibraryEntries(
      [
        { name: 'single arm kettlebell row', gym: 'MP2' },
        { name: 'Cable fly', gym: 'MP2' },
        { name: 'Single arm kettlebell row', gym: 'MP2' },
      ],
      EXERCISE_LIBRARY,
    )
    expect(kb).toMatchObject({ name: 'Single arm kettlebell row', gyms: ['any'], group: 'Back' })
    expect(cable).toMatchObject({ name: 'Cable fly', gyms: ['MP2'], group: 'Chest' })
  })
  it('skips names already in the list, including your own', () => {
    const mine = newLibraryEntries([{ name: 'Cable fly', gym: '41' }], EXERCISE_LIBRARY)
    expect(newLibraryEntries([{ name: 'cable fly' }, { name: 'Push-up' }], [...EXERCISE_LIBRARY, ...mine])).toEqual([])
    expect(libraryFor('41', mine).map((e) => e.name)).toContain('Cable fly')
    expect(libraryFor('MP2', mine).map((e) => e.name)).not.toContain('Cable fly')
  })
})
