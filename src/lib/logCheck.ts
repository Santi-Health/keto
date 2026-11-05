import type { Food, LogEntry } from './foods'
import { oversizedSeasonings } from './quickFoods'
import { entryDay } from './time'
import { lastDays } from './trends'

/** One entry at this many calories is worth a second look. */
export const BIG_ENTRY_KCAL = 500
/** This many times your usual amount of a food. */
const USUAL_MULTIPLE = 5
/** A usual amount needs this many other logs of the food. */
const MIN_OTHER_LOGS = 3
/** Calories and usual amounts are checked this far back, so old restaurant meals don't pile up. */
const RECENT_DAYS = 30

export interface FlaggedEntry {
  entry: LogEntry
  reason: 'seasoning' | 'usual' | 'calories'
  /** What's normal for this food, for reason 'usual'. */
  usualGrams?: number
}

const median = (ns: number[]) => {
  const sorted = [...ns].sort((a, b) => a - b)
  const mid = sorted.length / 2
  return Number.isInteger(mid) ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)]
}

/** Entries that look like a typo: salt or pepper by the handful, far above your usual amount, or very high in calories. Newest first. */
export function entriesToCheck(logs: LogEntry[], foodById: Record<string, Pick<Food, 'source'>>, today: string): FlaggedEntry[] {
  const seasonings = new Set(oversizedSeasonings(logs, foodById))
  const keyOf = (l: LogEntry) => l.food_id ?? l.food_name
  const byFood = new Map<string, LogEntry[]>()
  for (const l of logs) byFood.set(keyOf(l), [...(byFood.get(keyOf(l)) ?? []), l])
  const recent = new Set(lastDays(RECENT_DAYS, today))
  const out: FlaggedEntry[] = []
  for (const entry of logs) {
    if (entry.meta?.looksRight) continue
    if (seasonings.has(entry)) {
      out.push({ entry, reason: 'seasoning' })
      continue
    }
    if (!recent.has(entryDay(entry.eaten_at, entry.meta?.tz))) continue
    const others = byFood.get(keyOf(entry))!.filter((l) => l !== entry).map((l) => l.grams)
    const usualGrams = others.length >= MIN_OTHER_LOGS ? median(others) : 0
    if (usualGrams > 0 && entry.grams > usualGrams * USUAL_MULTIPLE) out.push({ entry, reason: 'usual', usualGrams })
    else if ((entry.nutrients.kcal ?? 0) >= BIG_ENTRY_KCAL) out.push({ entry, reason: 'calories' })
  }
  return out.sort((a, b) => b.entry.eaten_at.localeCompare(a.entry.eaten_at))
}
