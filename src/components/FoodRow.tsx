import type { Food, NewFood } from '../lib/foods'
import { formatAmount } from '../lib/units'
import { FoodFlags, foodSubtitle } from './FoodBits'

export function FoodRow({ food, onPick }: { food: Food | NewFood; onPick: () => void }) {
  const saved = 'id' in food ? food : null
  return (
    <button type="button" className="list-item" onClick={onPick}>
      {food.meta.imageUrl ? <img className="thumb" src={food.meta.imageUrl} alt="" loading="lazy" /> : null}
      <span className="grow">
        <span className="title" style={{ display: 'block' }}>
          {saved?.favorite ? '★ ' : ''}
          {food.source === 'recipe' ? '🍳 ' : ''}
          {food.name}
        </span>
        <span className="sub" style={{ display: 'block' }}>{foodSubtitle(food)}</span>
        <span style={{ display: 'block', marginTop: 4 }}>
          <FoodFlags food={food} />
        </span>
      </span>
      {saved?.meta.lastAmount != null && (
        <span className="right muted">{formatAmount(saved.meta.lastAmount, saved.meta.lastUnit ?? 'g')}</span>
      )}
    </button>
  )
}
