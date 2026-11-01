import type { Food } from '../lib/foods'
import { foodIcon } from '../lib/quickFoods'

/** Flavor colors for Oikos cups, with the banana drawn as a banana. */
const OIKOS_FLAVORS: [RegExp, string][] = [
  [/strawberr/, '#e0394a'],
  [/blueberr|mixed berr/, '#4b4fa8'],
  [/raspberr/, '#d63a6a'],
  [/cherr/, '#9e1b32'],
  [/peach/, '#f4a259'],
  [/vanilla/, '#efe3c2'],
  [/coconut/, '#f2efe6'],
  [/chocolate|cocoa/, '#5a3825'],
  [/caramel|salted/, '#c98a3c'],
  [/key lime|lime/, '#9cc95a'],
]

/** An Oikos Triple Zero cup: white, a flavor-colored lid, the flavor on top and "000" on the front. */
function OikosCup({ flavor }: { flavor: string }) {
  const banana = /banana/.test(flavor)
  const color = banana ? '#f3d34a' : (OIKOS_FLAVORS.find(([re]) => re.test(flavor))?.[1] ?? '#d9d9d9')
  return (
    <svg className="food-svg" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 12 L27 12 L24.5 30 L7.5 30 Z" fill="#fff" stroke="rgba(0,0,0,0.35)" />
      <rect x="4" y="10" width="24" height="3.2" rx="1.2" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
      <text x="16" y="24.5" fill="#111" fontSize="8" fontWeight={900} textAnchor="middle" textLength="15" lengthAdjust="spacingAndGlyphs" fontFamily="system-ui, sans-serif">
        000
      </text>
      {banana ? (
        // A banana resting on the lid.
        <>
          <path d="M6 7.5 Q16 13 27 5.5 Q26 9.5 16 10.2 Q9 10.2 6 7.5 Z" fill="#f3d34a" stroke="#b8901a" strokeWidth="0.7" strokeLinejoin="round" />
          <path d="M26.2 5.2 L27.6 4.4" stroke="#6b4a2e" strokeWidth="1.2" strokeLinecap="round" />
        </>
      ) : (
        <circle cx="16" cy="7" r="3.2" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
      )}
    </svg>
  )
}

/** Canadian bacon: round slices, stacked, pink with a thin rim of fat. */
function CanadianBacon() {
  const slice = (cx: number, cy: number) => (
    <g key={`${cx}${cy}`}>
      <ellipse cx={cx} cy={cy} rx="10" ry="7" fill="#f2c9b8" stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
      <ellipse cx={cx} cy={cy - 0.4} rx="8.6" ry="5.8" fill="#e58a86" />
      <ellipse cx={cx - 2.5} cy={cy - 2} rx="2.6" ry="1.2" fill="#f0a9a3" opacity="0.8" />
    </g>
  )
  return (
    <svg className="food-svg" viewBox="0 0 32 32" aria-hidden="true">
      {[slice(12, 21), slice(19, 16), slice(14, 11)]}
    </svg>
  )
}

/** A food button's picture: a drawing where one helps (Oikos cups, Canadian bacon), otherwise an emoji from the name. */
export function FoodIcon({ food }: { food: Food }) {
  const full = `${food.brand ?? ''} ${food.name}`.toLowerCase()
  if (/\boikos\b/.test(full)) return <OikosCup flavor={full} />
  if (/canadian bacon|back bacon|peameal/.test(full)) return <CanadianBacon />
  return <>{foodIcon(food)}</>
}
