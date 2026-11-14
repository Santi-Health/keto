import { createContext, useContext } from 'react'
import type { GymId } from './exercise'

/** Strength exercises you can pick from. `gyms` lists where it's available ('any' = every gym). */
export interface LibraryExercise {
  id: string
  name: string
  group: string
  gyms: (GymId | 'any')[]
  /** Holds are timed in seconds and cardio pieces in minutes; everything else is reps. */
  measure?: 's' | 'min'
}

export const LIBRARY_GROUPS = ['Legs', 'Hamstrings / glutes', 'Chest', 'Shoulders', 'Back', 'Arms', 'Abs / core', 'Cardio', 'Other'] as const

export const EXERCISE_LIBRARY: LibraryExercise[] = [
  { id: 'legext', name: 'Leg extension', group: 'Legs', gyms: ['41'] },
  { id: 'bsquat', name: 'Barbell back squat', group: 'Legs', gyms: ['41', 'MP2'] },
  { id: 'kbsquat', name: 'Goblet squat (kettlebell)', group: 'Legs', gyms: ['MP2'] },
  { id: 'kbsplit', name: 'Double kettlebell split squat', group: 'Legs', gyms: ['any'] },
  { id: 'lunge', name: 'Split squat / lunge', group: 'Legs', gyms: ['any'] },
  { id: 'stepup', name: 'Box step-up', group: 'Legs', gyms: ['any'] },
  { id: 'legcurl', name: 'Seated leg curl', group: 'Hamstrings / glutes', gyms: ['41'] },
  { id: 'hipthrust', name: 'Barbell hip thrust', group: 'Hamstrings / glutes', gyms: ['41', 'MP2'] },
  { id: 'kbswing', name: 'Kettlebell swing', group: 'Hamstrings / glutes', gyms: ['MP2'] },
  { id: 'hipabd', name: 'Hip abduction / adduction', group: 'Hamstrings / glutes', gyms: ['41'] },
  { id: 'backext', name: 'Back extension / roman chair', group: 'Hamstrings / glutes', gyms: ['41', 'MP2'] },
  { id: 'chestpress', name: 'Chest press (Matrix)', group: 'Chest', gyms: ['41'] },
  { id: 'inclpress', name: 'Incline press (Matrix)', group: 'Chest', gyms: ['41'] },
  { id: 'benchbar', name: 'Barbell bench press', group: 'Chest', gyms: ['41', 'MP2'] },
  { id: 'platechest', name: 'Plate-loaded chest press', group: 'Chest', gyms: ['MP2'] },
  { id: 'pushup', name: 'Push-up', group: 'Chest', gyms: ['any'] },
  { id: 'shpress', name: 'Shoulder press (Matrix)', group: 'Shoulders', gyms: ['41'] },
  { id: 'ohp', name: 'Overhead press (barbell)', group: 'Shoulders', gyms: ['41', 'MP2'] },
  { id: 'latpd', name: 'Lat pulldown (Matrix)', group: 'Back', gyms: ['41'] },
  { id: 'keiserlat', name: 'Lat pulldown (Keiser)', group: 'Back', gyms: ['MP2'] },
  { id: 'seatrow', name: 'Seated row (Matrix)', group: 'Back', gyms: ['41'] },
  { id: 'trxrow', name: 'TRX row', group: 'Back', gyms: ['any'] },
  { id: 'assistpu', name: 'Assisted pull-up', group: 'Back', gyms: ['41', 'MP2'] },
  { id: 'assistdip', name: 'Assisted dip / triceps', group: 'Arms', gyms: ['41', 'MP2'] },
  { id: 'curl', name: 'Dumbbell curl', group: 'Arms', gyms: ['any'] },
  { id: 'declab', name: 'Decline sit-up / ab crunch', group: 'Abs / core', gyms: ['MP2'] },
  { id: 'elbowknee', name: 'Elbow-to-knee crunch', group: 'Abs / core', gyms: ['any'] },
  { id: 'abkick', name: 'Alternating ab kicks', group: 'Abs / core', gyms: ['any'] },
  { id: 'hangknee', name: 'Hanging knee raise', group: 'Abs / core', gyms: ['any'] },
  { id: 'rotation', name: 'Keiser rotation (cable)', group: 'Abs / core', gyms: ['MP2'] },
  { id: 'mbshoulder', name: 'Med ball over-the-shoulder toss', group: 'Abs / core', gyms: ['any'] },
  { id: 'hollow', name: 'Hollow hold', group: 'Abs / core', gyms: ['any'], measure: 's' },
  { id: 'plank', name: 'Plank', group: 'Abs / core', gyms: ['any'], measure: 's' },
  { id: 'stair', name: 'StairMaster', group: 'Cardio', gyms: ['41', 'MP2'], measure: 'min' },
  { id: 'rower', name: 'Row machine', group: 'Cardio', gyms: ['41', 'MP2'], measure: 'min' },
]

/** Exercises available at a gym (or all of them when no gym is chosen), yours added after the built-in ones. */
export function libraryFor(gym?: GymId, custom: LibraryExercise[] = []): LibraryExercise[] {
  return [...EXERCISE_LIBRARY, ...custom].filter((e) => !gym || e.gyms.includes('any') || e.gyms.includes(gym))
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Spaces tidied and the first letter capitalized, the way the list writes names. */
export function tidyLiftName(name: string): string {
  const s = name.trim().replace(/\s+/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Edit distance (Levenshtein), for spotting typos. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}

/** The exact list entry for a name, ignoring case and punctuation. */
export function findLift(name: string, list: LibraryExercise[]): LibraryExercise | undefined {
  const k = key(name)
  return list.find((e) => key(e.name) === k)
}

/**
 * A close list entry for a name that isn't in the list: a typo (a few letters off) or the same words in another
 * order. Null when the name is already listed or nothing is close.
 */
export function suggestLift(name: string, list: LibraryExercise[]): LibraryExercise | null {
  const k = key(name)
  if (k.length < 4 || findLift(name, list)) return null
  const words = (s: string) => s.split(' ').sort().join(' ')
  let best: { e: LibraryExercise; d: number } | null = null
  for (const e of list) {
    const ek = key(e.name)
    if (words(ek) === words(k)) return e
    const d = distance(k, ek)
    if (d <= Math.max(2, Math.floor(ek.length * 0.2)) && (!best || d < best.d)) best = { e, d }
  }
  return best?.e ?? null
}

const FREE_WEIGHTS = /kettlebell|\bkb\b|dumbbell|\bdb\b|med(icine)? ?ball|body ?weight|push-?up|plank|crunch|sit-?up|lunge|burpee|jump|band/i
const MACHINES = /machine|cable|keiser|matrix|smith|plate-loaded|leg press|pulldown|assisted|barbell|bench|rack/i

/** How a new lift is measured, from its name: holds in seconds, cardio pieces in minutes. */
export function measureForNew(name: string): LibraryExercise['measure'] {
  if (groupForNew(name) === 'Cardio') return 'min'
  return /\b(hold|plank|wall sit|dead hang|l-?sit|hang)\b/i.test(name) && !/knee raise|leg raise/i.test(name) ? 's' : undefined
}

/** Where a new lift goes: free weights and bodyweight to every gym, anything with a machine or bar only to its gym. */
export function gymsForNew(name: string, gym?: GymId): LibraryExercise['gyms'] {
  if (!gym) return ['any']
  return FREE_WEIGHTS.test(name) && !MACHINES.test(name) ? ['any'] : [gym]
}

const GROUP_WORDS: [RegExp, string][] = [
  [/stair|row(ing)? machine|rower|erg\b|treadmill|bike|cycle|elliptical|ski ?erg|assault|jump rope/i, 'Cardio'],
  [/crunch|sit-?up|plank|\bab|core|oblique|rotation|twist|knee raise|leg raise|toss|throw|slam|woodchop/i, 'Abs / core'],
  [/hip thrust|glute|hamstring|leg curl|deadlift|\brdl\b|swing|bridge|back extension|abduct|adduct/i, 'Hamstrings / glutes'],
  [/squat|lunge|step-?up|leg press|leg extension|calf/i, 'Legs'],
  [/shoulder|overhead|lateral raise|front raise|rear delt|arnold|military/i, 'Shoulders'],
  [/row|pull|lat |chin-?up|shrug/i, 'Back'],
  [/chest|bench|push-?up|fly|pec/i, 'Chest'],
  [/curl|tricep|dip|extension|skull/i, 'Arms'],
]

export function groupForNew(name: string): string {
  return GROUP_WORDS.find(([re]) => re.test(name))?.[1] ?? 'Other'
}

/** Lifts that aren't in the list yet, made into entries for it (one per name). */
export function newLibraryEntries(lifts: { name: string; gym?: GymId; measure?: 'reps' | 's' | 'min' }[], list: LibraryExercise[]): LibraryExercise[] {
  const out: LibraryExercise[] = []
  for (const l of lifts) {
    const name = tidyLiftName(l.name)
    if (!name || findLift(name, [...list, ...out])) continue
    const measure = l.measure && l.measure !== 'reps' ? l.measure : measureForNew(name)
    out.push({ id: `custom-${key(name).replace(/ /g, '-')}`, name, group: groupForNew(name), gyms: gymsForNew(name, l.gym), ...(measure ? { measure } : {}) })
  }
  return out
}

/** Your own lifts (saved in the profile) and a way to add more. */
export const CustomLiftsContext = createContext<{ custom: LibraryExercise[]; add: (entries: LibraryExercise[]) => void }>({
  custom: [],
  add: () => {},
})

export const useCustomLifts = () => useContext(CustomLiftsContext)
