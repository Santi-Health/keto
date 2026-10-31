import { useState } from 'react'
import type { Food, NewFood } from '../lib/foods'
import { useFoodSearch } from '../lib/useFoodSearch'
import { FoodRow } from './FoodRow'
import { Sheet } from './Sheet'

interface Props {
  title?: string
  initialQuery?: string
  onPick: (food: Food | NewFood) => void
  onClose: () => void
}

/** Search My Foods and USDA and pick one food (for recipe ingredients). */
export function FoodPicker({ title = 'Choose a food', initialQuery = '', onPick, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const { q, mine, results, searching, error } = useFoodSearch(query, 20)
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input type="search" aria-label="Search foods" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </div>
      <div className="section-label">My foods</div>
      {mine.length ? (
        <div className="food-grid">
          {mine.map((f) => (
            <FoodRow key={f.id} food={f} onPick={() => onPick(f)} />
          ))}
        </div>
      ) : (
        <p className="muted small">No saved foods match.</p>
      )}
      {q.length >= 3 && (
        <>
          <div className="section-label">USDA food database</div>
          {searching && <p className="muted small">Searching…</p>}
          {error && <p className="notice small">{error}</p>}
          <div className="food-grid">
            {results.map((f) => (
              <FoodRow key={f.meta.externalId} food={f} onPick={() => onPick(f)} />
            ))}
          </div>
        </>
      )}
    </Sheet>
  )
}
