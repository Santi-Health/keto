import type { GymId } from './exercise'

/** Strength exercises you can pick from. `gyms` lists where it's available ('any' = every gym). */
export interface LibraryExercise {
  id: string
  name: string
  group: string
  gyms: (GymId | 'any')[]
}

export const LIBRARY_GROUPS = ['Legs', 'Hamstrings / glutes', 'Chest', 'Shoulders', 'Back', 'Arms', 'Abs / core'] as const

export const EXERCISE_LIBRARY: LibraryExercise[] = [
  { id: 'legext', name: 'Leg extension', group: 'Legs', gyms: ['41'] },
  { id: 'bsquat', name: 'Barbell back squat', group: 'Legs', gyms: ['41', 'MP2'] },
  { id: 'kbsquat', name: 'Goblet squat (kettlebell)', group: 'Legs', gyms: ['MP2'] },
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
  { id: 'curl', name: 'Dumbbell curl', group: 'Arms', gyms: ['41', 'Home'] },
  { id: 'declab', name: 'Decline sit-up / ab crunch', group: 'Abs / core', gyms: ['MP2'] },
  { id: 'elbowknee', name: 'Elbow-to-knee crunch', group: 'Abs / core', gyms: ['any'] },
  { id: 'abkick', name: 'Alternating ab kicks', group: 'Abs / core', gyms: ['any'] },
  { id: 'hangknee', name: 'Hanging knee raise', group: 'Abs / core', gyms: ['any'] },
  { id: 'rotation', name: 'Keiser rotation (cable)', group: 'Abs / core', gyms: ['MP2'] },
]

/** Exercises available at a gym (or all of them when no gym is chosen). */
export function libraryFor(gym?: GymId): LibraryExercise[] {
  return EXERCISE_LIBRARY.filter((e) => !gym || e.gyms.includes('any') || e.gyms.includes(gym))
}
