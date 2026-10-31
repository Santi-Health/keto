import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from './data'
import { searchUsda } from './foodApi'
import { rankFoods, type Food, type NewFood } from './foods'

/** Saved foods matching every word of the query, best-ranked first. */
export function matchMyFoods(foods: Food[], query: string, limit = 10): Food[] {
  const q = query.trim().toLowerCase()
  const ranked = rankFoods(foods)
  if (!q) return ranked.slice(0, limit)
  const words = q.split(/\s+/).map((w) => w.replace(/(es|s)$/, ''))
  return ranked.filter((f) => words.every((w) => `${f.name} ${f.brand ?? ''}`.toLowerCase().includes(w))).slice(0, limit)
}

/**
 * Searches My Foods instantly and the USDA database once typing pauses.
 * USDA results already in My Foods are left out.
 */
export function useFoodSearch(query: string, mineLimit = 10) {
  const { foods } = useData()
  const [results, setResults] = useState<NewFood[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const foodsRef = useRef(foods)
  useEffect(() => {
    foodsRef.current = foods
  }, [foods])

  const q = query.trim().toLowerCase()
  const mine = useMemo(() => matchMyFoods(foods, q, q ? 10 : mineLimit), [foods, q, mineLimit])

  // Wait until typing pauses, so each keystroke isn't a request.
  useEffect(() => {
    setError(null)
    if (q.length < 3) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const ctrl = new AbortController()
    const t = window.setTimeout(() => {
      searchUsda(q, ctrl.signal)
        .then((r) => {
          const known = new Set(foodsRef.current.map((f) => f.meta.externalId))
          setResults(r.filter((f) => !known.has(f.meta.externalId)))
        })
        .catch((e) => !ctrl.signal.aborted && setError((e as Error).message))
        .finally(() => !ctrl.signal.aborted && setSearching(false))
    }, 450)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [q])

  return { q, mine, results, searching, error }
}
