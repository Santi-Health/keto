import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { FoodFlags, foodSubtitle } from '../components/FoodBits'
import { FoodForm } from '../components/FoodForm'
import { LogFoodSheet } from '../components/LogFoodSheet'
import { useData } from '../lib/data'
import { lookupBarcode, searchUsda } from '../lib/foodApi'
import { rankFoods, type Food, type NewFood } from '../lib/foods'
import { formatAmount } from '../lib/units'

type Overlay =
  | { kind: 'log'; food: Food | NewFood }
  | { kind: 'form'; food?: Food | NewFood; barcode?: string }
  | { kind: 'scan' }
  | null

interface Props {
  /** Open the camera scanner right away (from the Today quick-add button). */
  startScan?: boolean
  /** Day to log on (YYYY-MM-DD), when adding to a past day from the Log screen. */
  date?: string
  onLogged: () => void
}

export function Add({ startScan, date, onLogged }: Props) {
  const { foods } = useData()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NewFood[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<Overlay>(startScan ? { kind: 'scan' } : null)
  const [notice, setNotice] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const foodsRef = useRef(foods)
  useEffect(() => {
    foodsRef.current = foods
  }, [foods])

  const q = query.trim().toLowerCase()
  const mine = useMemo(() => {
    const ranked = rankFoods(foods)
    if (!q) return ranked.slice(0, 40)
    const words = q.split(/\s+/)
    return ranked.filter((f) => words.every((w) => `${f.name} ${f.brand ?? ''}`.toLowerCase().includes(w))).slice(0, 10)
  }, [foods, q])

  // Database search waits until typing pauses, so each keystroke isn't a request.
  useEffect(() => {
    abort.current?.abort()
    setError(null)
    if (q.length < 3) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const ctrl = new AbortController()
    abort.current = ctrl
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

  const onDetected = useCallback(
    async (code: string) => {
      const clean = code.replace(/\D/g, '')
      const existing = foods.find((f) => f.barcode === clean)
      if (existing) return setOverlay({ kind: 'log', food: existing })
      setOverlay(null)
      setNotice(`Looking up ${clean}…`)
      try {
        const found = await lookupBarcode(clean)
        setNotice(null)
        if (found) setOverlay({ kind: 'log', food: found })
        else {
          setNotice(`Barcode ${clean} isn't in the food databases yet. Enter it from the label and it will be remembered.`)
          setOverlay({ kind: 'form', barcode: clean })
        }
      } catch {
        setNotice("Couldn't look up the barcode (offline?). You can enter the food from the label.")
        setOverlay({ kind: 'form', barcode: clean })
      }
    },
    [foods],
  )

  const close = useCallback(() => setOverlay(null), [])
  const logged = () => {
    setQuery('')
    onLogged()
  }

  return (
    <>
      <header className="page-header">
        <h1>Add food</h1>
        {date && (
          <span className="badge">
            to {new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        )}
      </header>

      <div className="card">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            placeholder="Search foods, e.g. avocado, Kerrygold butter"
            aria-label="Search foods"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus={!startScan}
          />
        </div>
        <div className="quick" style={{ marginTop: 10, gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <button type="button" onClick={() => setOverlay({ kind: 'scan' })} style={{ color: 'var(--text)' }}>
            Scan barcode
          </button>
          <button type="button" onClick={() => setOverlay({ kind: 'form' })} style={{ color: 'var(--text)' }}>
            Enter from label
          </button>
        </div>
        {notice && <p className="notice small" style={{ marginBottom: 0 }}>{notice}</p>}

        <div className="section-label">{q ? 'My foods' : 'My foods: favorites and most used'}</div>
        {mine.length ? (
          <div className="list">
            {mine.map((f) => (
              <FoodRow key={f.id} food={f} onPick={() => setOverlay({ kind: 'log', food: f })} />
            ))}
          </div>
        ) : (
          <p className="muted small">
            {q ? 'No saved foods match.' : 'Foods you log show up here, with favorites and the ones you use most at the top.'}
          </p>
        )}

        {q.length >= 3 && (
          <>
            <div className="section-label">USDA food database</div>
            {searching && <p className="muted small">Searching…</p>}
            {error && <p className="notice small">{error}</p>}
            {!searching && !error && !results.length && <p className="muted small">No matches. Try fewer words, or enter it from the label.</p>}
            <div className="list">
              {results.map((f) => (
                <FoodRow key={f.meta.externalId} food={f} onPick={() => setOverlay({ kind: 'log', food: f })} />
              ))}
            </div>
          </>
        )}
      </div>

      {overlay?.kind === 'scan' && <BarcodeScanner onDetected={onDetected} onClose={close} />}
      {overlay?.kind === 'log' && (
        <LogFoodSheet food={overlay.food} date={date} onClose={close} onDone={logged} onEditFood={(food) => setOverlay({ kind: 'form', food })} />
      )}
      {overlay?.kind === 'form' && (
        <FoodForm
          food={overlay.food}
          barcode={overlay.barcode}
          onClose={close}
          onSaved={(food) => {
            setNotice(null)
            setOverlay({ kind: 'log', food })
          }}
        />
      )}
    </>
  )
}

function FoodRow({ food, onPick }: { food: Food | NewFood; onPick: () => void }) {
  const saved = 'id' in food ? food : null
  return (
    <button type="button" className="list-item" onClick={onPick}>
      {food.meta.imageUrl ? <img className="thumb" src={food.meta.imageUrl} alt="" loading="lazy" /> : null}
      <span className="grow">
        <span className="title" style={{ display: 'block' }}>
          {saved?.favorite ? '★ ' : ''}
          {food.name}
        </span>
        <span className="sub" style={{ display: 'block' }}>{foodSubtitle(food)}</span>
        <span style={{ display: 'block', marginTop: 4 }}>
          <FoodFlags food={food} />
        </span>
      </span>
      {saved?.meta.lastAmount != null && (
        <span className="right muted">
          {formatAmount(saved.meta.lastAmount, saved.meta.lastUnit ?? 'g')}
        </span>
      )}
    </button>
  )
}
