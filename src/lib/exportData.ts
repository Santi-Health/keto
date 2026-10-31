import type { ActivityDay } from './activity'
import { toReadings, type CgmDay } from './cgm'
import type { Exercise } from './exercise'
import type { Food, LogEntry } from './foods'
import type { ReadingRow } from './readings'
import type { SavedMeal } from './savedMeals'
import type { Profile } from './types'

/** Everything the app knows, for backup or analysis elsewhere. */
export interface ExportBundle {
  exportedAt: string
  profile: Profile
  foods: Food[]
  foodLogs: LogEntry[]
  savedMeals: SavedMeal[]
  exercises: Exercise[]
  readings: ReadingRow[]
  activity: ActivityDay[]
  cgmDays: CgmDay[]
}

const cell = (v: unknown): string => {
  if (v == null) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n') + '\n'
}

const local = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** One CSV per kind of data, in local time, one row per entry. */
export function csvFiles(b: ExportBundle): Record<string, string> {
  const nutrientKeys = ['kcal', 'netCarbs', 'carbs', 'fiber', 'protein', 'fat', 'satFat', 'sodiumMg', 'potassiumMg', 'magnesiumMg', 'caffeineMg', 'leuG'] as const
  return {
    'food-log.csv': toCsv(
      ['time', 'meal', 'food', 'amount', 'unit', 'grams', ...nutrientKeys],
      [...b.foodLogs]
        .sort((x, y) => x.eaten_at.localeCompare(y.eaten_at))
        .map((l) => [local(l.eaten_at), l.meal, l.food_name, l.amount, l.unit, Math.round(l.grams), ...nutrientKeys.map((k) => (l.nutrients[k] == null ? '' : Math.round(l.nutrients[k]! * 10) / 10))]),
    ),
    'readings.csv': toCsv(
      ['time', 'kind', 'value', 'unit', 'urine_level', 'context', 'estimate_at_time', 'note', 'details'],
      [...b.readings]
        .sort((x, y) => x.taken_at.localeCompare(y.taken_at))
        .map((r) => [local(r.taken_at), r.kind, r.value, r.unit, r.urine_level, r.context, r.predicted_value, r.note, Object.keys(r.meta).length ? r.meta : '']),
    ),
    'exercise.csv': toCsv(
      ['start', 'kind', 'minutes', 'intensity', 'active_kcal', 'source', 'note', 'details'],
      [...b.exercises]
        .sort((x, y) => x.started_at.localeCompare(y.started_at))
        .map((e) => [local(e.started_at), e.kind, e.duration_min, e.intensity, e.calories, e.source, e.note, e.meta]),
    ),
    'activity.csv': toCsv(
      ['day', 'steps', 'kcal_burned', 'resting_hr', 'sleep_min', 'deep_min', 'rem_min'],
      [...b.activity].sort((x, y) => x.day.localeCompare(y.day)).map((a) => [a.day, a.steps, a.calories_out, a.resting_hr, a.sleep_minutes, a.meta.deepMin, a.meta.remMin]),
    ),
    'glucose-cgm.csv': toCsv(
      ['time', 'mg_dl'],
      toReadings(b.cgmDays).map((r) => [local(new Date(r.t).toISOString()), r.v]),
    ),
  }
}

/** Saves a file through the browser's download. */
export function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
