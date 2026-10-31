import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
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
}

const DataContext = createContext<Data | null>(null)

export function DataProvider({ session, children }: { session: Session | null; children: ReactNode }) {
  const foodsTable = useSyncedTable<Food>('foods', session)
  const logsTable = useSyncedTable<LogEntry>('food_logs', session)

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

  const value = useMemo<Data>(
    () => ({
      foods: foodsTable.rows,
      foodById: foodsTable.byId,
      logs: logsTable.rows,
      // Without a database (local development) nothing is waiting to sync.
      pending: supabase ? foodsTable.pending + logsTable.pending : 0,
      syncError: foodsTable.error ?? logsTable.error,
      saveFood,
      updateFood: foodsTable.upsert,
      deleteFood: foodsTable.remove,
      logFood,
      updateLog: logsTable.upsert,
      deleteLog: logsTable.remove,
      logsOn,
      logsWeekEnding,
    }),
    [foodsTable, logsTable, saveFood, logFood, logsOn, logsWeekEnding],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): Data {
  const d = useContext(DataContext)
  if (!d) throw new Error('useData must be used inside DataProvider')
  return d
}
