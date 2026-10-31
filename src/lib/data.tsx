import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { CgmDay } from './cgm'
import type { Exercise } from './exercise'
import type { ActivityDay } from './activity'
import type { ReadingRow } from './readings'
import type { SavedMeal } from './savedMeals'
import { buildLogEntry, type Food, type LogEntry, type Meal, type NewFood } from './foods'
import { supabase } from './supabase'
import { localDate } from './targets'
import { useSyncedTable } from './syncTable'

interface Data {
  foods: Food[]
  foodById: Record<string, Food>
  logs: LogEntry[]
  pending: number
  syncError: string | null
  /** Saves a food, reusing an existing one with the same barcode or source id. */
  saveFood: (food: NewFood | Food) => Food
  updateFood: (food: Food) => void
  deleteFood: (id: string) => void
  logFood: (food: Food, amount: number, unit: string, meal: Meal, eatenAt: Date) => LogEntry
  updateLog: (entry: LogEntry) => void
  deleteLog: (id: string) => void
  logsOn: (date: string) => LogEntry[]
  /** Logs from the 7 days ending on `date`. */
  logsWeekEnding: (date: string) => LogEntry[]
  exercises: Exercise[]
  saveExercise: (e: Exercise) => void
  deleteExercise: (id: string) => void
  exercisesOn: (date: string) => Exercise[]
  cgmDays: Record<string, CgmDay>
  saveCgmDay: (d: CgmDay) => void
  readings: ReadingRow[]
  saveReading: (r: ReadingRow) => void
  deleteReading: (id: string) => void
  readingsOn: (date: string) => ReadingRow[]
  activity: Record<string, ActivityDay>
  saveActivity: (d: ActivityDay) => void
  savedMeals: SavedMeal[]
  saveMeal: (m: SavedMeal) => void
  deleteMeal: (id: string) => void
}

const DataContext = createContext<Data | null>(null)

export function DataProvider({ session, children }: { session: Session | null; children: ReactNode }) {
  const foodsTable = useSyncedTable<Food>('foods', session)
  const logsTable = useSyncedTable<LogEntry>('food_logs', session)
  const exerciseTable = useSyncedTable<Exercise>('exercises', session)
  const cgmTable = useSyncedTable<CgmDay>('cgm_days', session)
  const readingTable = useSyncedTable<ReadingRow>('readings', session)
  const mealTable = useSyncedTable<SavedMeal>('saved_meals', session)
  const activityTable = useSyncedTable<ActivityDay>('daily_activity', session)

  const saveFood = useCallback(
    (food: NewFood | Food): Food => {
      if ('id' in food) {
        foodsTable.upsert(food)
        return food
      }
      const existing = foodsTable.rows.find(
        (f) =>
          (food.barcode && f.barcode === food.barcode) ||
          (food.meta.externalId && f.meta.externalId === food.meta.externalId),
      )
      if (existing) return existing
      const created: Food = {
        ...food,
        id: crypto.randomUUID(),
        favorite: false,
        use_count: 0,
        last_used_at: null,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      }
      foodsTable.upsert(created)
      return created
    },
    [foodsTable],
  )

  const logFood = useCallback(
    (food: Food, amount: number, unit: string, meal: Meal, eatenAt: Date) => {
      const entry: LogEntry = {
        ...buildLogEntry(food, amount, unit, meal, eatenAt),
        id: crypto.randomUUID(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      }
      logsTable.upsert(entry)
      foodsTable.upsert({
        ...food,
        use_count: food.use_count + 1,
        last_used_at: new Date().toISOString(),
        meta: { ...food.meta, lastAmount: amount, lastUnit: unit },
      })
      return entry
    },
    [foodsTable, logsTable],
  )

  const logsOn = useCallback(
    (date: string) =>
      logsTable.rows.filter((l) => localDate(new Date(l.eaten_at)) === date).sort((a, b) => a.eaten_at.localeCompare(b.eaten_at)),
    [logsTable.rows],
  )

  const logsWeekEnding = useCallback(
    (date: string) => {
      const end = new Date(`${date}T00:00:00`)
      const start = new Date(end)
      start.setDate(start.getDate() - 6)
      const from = localDate(start)
      return logsTable.rows.filter((l) => {
        const d = localDate(new Date(l.eaten_at))
        return d >= from && d <= date
      })
    },
    [logsTable.rows],
  )

  const exercisesOn = useCallback(
    (date: string) =>
      exerciseTable.rows
        .filter((e) => localDate(new Date(e.started_at)) === date)
        .sort((a, b) => a.started_at.localeCompare(b.started_at)),
    [exerciseTable.rows],
  )

  const readingsOn = useCallback(
    (date: string) =>
      readingTable.rows
        .filter((r) => localDate(new Date(r.taken_at)) === date)
        .sort((a, b) => a.taken_at.localeCompare(b.taken_at)),
    [readingTable.rows],
  )

  const value = useMemo<Data>(
    () => ({
      foods: foodsTable.rows,
      foodById: foodsTable.byId,
      logs: logsTable.rows,
      // Without a database (local development) nothing is waiting to sync.
      pending: supabase ? foodsTable.pending + logsTable.pending + exerciseTable.pending + cgmTable.pending + readingTable.pending + mealTable.pending + activityTable.pending : 0,
      syncError: foodsTable.error ?? logsTable.error ?? exerciseTable.error ?? cgmTable.error ?? readingTable.error ?? mealTable.error ?? activityTable.error,
      saveFood,
      updateFood: foodsTable.upsert,
      deleteFood: foodsTable.remove,
      logFood,
      updateLog: logsTable.upsert,
      deleteLog: logsTable.remove,
      logsOn,
      logsWeekEnding,
      exercises: exerciseTable.rows,
      saveExercise: exerciseTable.upsert,
      deleteExercise: exerciseTable.remove,
      exercisesOn,
      cgmDays: cgmTable.byId,
      saveCgmDay: cgmTable.upsert,
      readings: readingTable.rows,
      saveReading: readingTable.upsert,
      deleteReading: readingTable.remove,
      readingsOn,
      activity: activityTable.byId,
      saveActivity: activityTable.upsert,
      savedMeals: mealTable.rows,
      saveMeal: mealTable.upsert,
      deleteMeal: mealTable.remove,
    }),
    [foodsTable, logsTable, exerciseTable, cgmTable, readingTable, mealTable, activityTable, saveFood, logFood, logsOn, logsWeekEnding, exercisesOn, readingsOn],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): Data {
  const d = useContext(DataContext)
  if (!d) throw new Error('useData must be used inside DataProvider')
  return d
}
