import { useState } from 'react'
import { useData } from '../lib/data'
import type { Food } from '../lib/foods'
import { unshout } from '../lib/quickFoods'

/** Removes a food from My Foods after a second tap. Entries already logged keep their numbers. */
export function DeleteFood({ food, onDeleted, asLink }: { food: Food; onDeleted: () => void; asLink?: boolean }) {
  const { deleteFood } = useData()
  const [asking, setAsking] = useState(false)
  if (!asking)
    return (
      <button type="button" className={asLink ? 'delete-link' : 'btn secondary'} onClick={() => setAsking(true)}>
        Delete food
      </button>
    )
  return (
    <div className="delete-confirm" role="alert">
      <span className="small">Delete {unshout(food.name)} from My Foods? What you already logged stays.</span>
      <button type="button" className="btn secondary small-btn" onClick={() => setAsking(false)}>
        Keep
      </button>
      <button
        type="button"
        className="btn danger small-btn"
        onClick={() => {
          deleteFood(food.id)
          onDeleted()
        }}
      >
        Delete
      </button>
    </div>
  )
}
