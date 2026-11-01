import type { ReactNode } from 'react'
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

const EDGE = 'rgba(0,0,0,0.32)'
const Svg = ({ children }: { children: ReactNode }) => (
  <svg className="food-svg" viewBox="0 0 32 32" aria-hidden="true">
    {children}
  </svg>
)

/** Sliced cheese: two square slices, Swiss with holes. */
function CheeseSlices({ holes, color }: { holes: boolean; color: string }) {
  const slice = (x: number, y: number, r: number) => (
    <g transform={`rotate(${r} ${x + 9} ${y + 9})`}>
      <rect x={x} y={y} width="18" height="18" rx="1.5" fill={color} stroke={EDGE} strokeWidth="0.7" />
      {holes &&
        [
          [4, 5, 1.8],
          [12, 4, 1.2],
          [9, 11, 2.2],
          [14.5, 13.5, 1.4],
          [4, 14, 1.1],
        ].map(([hx, hy, r2]) => <circle key={`${hx}${hy}`} cx={x + hx} cy={y + hy} r={r2} fill="#e3c75e" />)}
    </g>
  )
  return (
    <Svg>
      {slice(3, 4, -8)}
      {slice(10, 10, 6)}
    </Svg>
  )
}

/** Shredded cheese: a little mound of shreds. */
function Shreds({ color }: { color: string }) {
  const bits = [
    [6, 26, 12, 23],
    [11, 27, 17, 25],
    [17, 26, 24, 27],
    [22, 24, 27, 26],
    [8, 21, 14, 19],
    [14, 21, 20, 22],
    [19, 19, 25, 21],
    [10, 16, 16, 15],
    [15, 15, 21, 17],
    [12, 11, 18, 12],
  ]
  return (
    <Svg>
      {bits.map(([x1, y1, x2, y2]) => (
        <g key={`${x1}${y1}`}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={EDGE} strokeWidth="3.4" strokeLinecap="round" />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      ))}
    </Svg>
  )
}

/** A crinkled snack bag with cheese puffs on it (cheese bites); onion flavor gets a green band. */
function SnackBag({ band }: { band: string }) {
  return (
    <Svg>
      <path d="M7 4 L9 3 L11 4 L13 3 L15 4 L17 3 L19 4 L21 3 L23 4 L25 3 L25.5 6 Q27 16 25.5 26 L25 29 L23 28 L21 29 L19 28 L17 29 L15 28 L13 29 L11 28 L9 29 L7 28 L6.5 26 Q5 16 6.5 6 Z" fill="#f28c1b" stroke={EDGE} strokeWidth="0.7" strokeLinejoin="round" />
      <rect x="6.6" y="8" width="18.8" height="4.5" fill={band} />
      {[
        [11, 18, 2.6],
        [17, 17, 2.2],
        [14, 23, 2.4],
        [20.5, 22, 2],
      ].map(([cx, cy, r]) => (
        <circle key={`${cx}${cy}`} cx={cx} cy={cy} r={r} fill="#ffb347" stroke="#c45f00" strokeWidth="0.6" />
      ))}
    </Svg>
  )
}

/** A cured ham leg (prosciutto, jamón): the meat with its fat rim, narrowing to the hoof. */
function HamLeg() {
  return (
    <Svg>
      <path d="M4 22 Q2 12 11 8 Q19 5 24 10 L29 4 L30.5 6 L26 12 Q28 18 22 24 Q14 30 4 22 Z" fill="#f3dccb" stroke={EDGE} strokeWidth="0.7" />
      <path d="M6 21 Q4.5 13 12 10 Q18 8 22 12 Q25 17 20 22 Q13 27 6 21 Z" fill="#c4453e" />
      <path d="M9 18 Q12 14 17 13" fill="none" stroke="#e07a70" strokeWidth="1" />
      <path d="M28.6 3.2 L31 5.6 L29.8 7 L27.4 4.6 Z" fill="#3b2a1a" />
    </Svg>
  )
}

/** Two olives: black for kalamata, green otherwise. */
function Olives({ color, shine }: { color: string; shine: string }) {
  const olive = (cx: number, cy: number, r: number) => (
    <g transform={`rotate(${r} ${cx} ${cy})`}>
      {/* A mid-gray edge keeps black olives visible in dark mode. */}
      <ellipse cx={cx} cy={cy} rx="6.5" ry="9" fill={color} stroke="#8d8590" strokeWidth="0.8" />
      <ellipse cx={cx - 2} cy={cy - 3.5} rx="1.6" ry="2.6" fill={shine} opacity="0.7" />
    </g>
  )
  return (
    <Svg>
      {olive(11, 17, -20)}
      {olive(21, 15, 18)}
    </Svg>
  )
}

/** A shaker: glass with ground pepper, or the blue, perfectly round NuSalt canister. */
function PepperShaker() {
  return (
    <Svg>
      <path d="M10 10 Q16 4 22 10 Z" fill="#c9ced4" stroke={EDGE} strokeWidth="0.6" />
      {[13, 16, 19].map((x) => (
        <circle key={x} cx={x} cy={8.6} r="0.5" fill="#555" />
      ))}
      <path d="M9.5 10 L22.5 10 L23.5 29 L8.5 29 Z" fill="#e9eef2" stroke={EDGE} strokeWidth="0.7" />
      <path d="M9.2 15 L22.8 15 L23.5 29 L8.5 29 Z" fill="#3a3a3a" />
      {[
        [11, 18],
        [15, 21],
        [19, 17],
        [13, 25],
        [20, 25],
        [17, 27],
      ].map(([cx, cy]) => (
        <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="0.6" fill="#8a8a8a" />
      ))}
    </Svg>
  )
}

function NuSalt() {
  return (
    <Svg>
      <rect x="9" y="7" width="14" height="22" fill="#2f6fd1" stroke={EDGE} strokeWidth="0.7" />
      <ellipse cx="16" cy="29" rx="7" ry="1.6" fill="#2a62ba" stroke={EDGE} strokeWidth="0.6" />
      <rect x="9" y="4" width="14" height="4" fill="#eef0f2" stroke={EDGE} strokeWidth="0.6" />
      <ellipse cx="16" cy="4" rx="7" ry="1.6" fill="#fafbfc" stroke={EDGE} strokeWidth="0.6" />
      <text x="16" y="18" fill="#fff" fontSize="5.4" fontWeight={800} textAnchor="middle" fontFamily="system-ui, sans-serif">
        Nu
      </text>
      <text x="16" y="24" fill="#fff" fontSize="5.4" fontWeight={800} textAnchor="middle" fontFamily="system-ui, sans-serif">
        Salt
      </text>
    </Svg>
  )
}

/** A jar with a white lid and a label: yellow for mayo, red for ketchup. */
function Jar({ color, label, ink }: { color: string; label: string; ink: string }) {
  return (
    <Svg>
      <rect x="9" y="3.5" width="14" height="5" rx="1.2" fill="#f4f4f4" stroke={EDGE} strokeWidth="0.7" />
      <path d="M8 9 L24 9 Q26.5 9 26.5 12 L26.5 27 Q26.5 30 23.5 30 L8.5 30 Q5.5 30 5.5 27 L5.5 12 Q5.5 9 8 9 Z" fill={color} stroke={EDGE} strokeWidth="0.7" />
      <rect x="5.6" y="15" width="20.8" height="8" fill="#fff" />
      <text x="16" y="21" fill={ink} fontSize="5.2" fontWeight={900} textAnchor="middle" textLength={label.length > 4 ? 17 : 12} lengthAdjust="spacingAndGlyphs" fontFamily="system-ui, sans-serif">
        {label}
      </text>
    </Svg>
  )
}

/** Drawings matched on brand + name, first match wins; anything else gets an emoji from the name. */
const DRAWN: [RegExp, (full: string, unit: string) => ReactNode, RegExp?][] = [
  [/\boikos\b/, (full) => <OikosCup flavor={full} />],
  [/canadian bacon|back bacon|peameal/, () => <CanadianBacon />],
  [/\bnu ?salt\b/, () => <NuSalt />],
  [/\bmayo(nnaise)?\b|\baioli\b/, () => <Jar color="#f6d860" label="Mayo" ink="#2f5fb3" />],
  [/\bketchup\b|\bcatsup\b/, () => <Jar color="#d6262b" label="Ketchup" ink="#d6262b" />],
  // Ground pepper, not bell or chili peppers.
  [/\bpepper\b/, () => <PepperShaker />, /bell|jalape|poblano|chili|sweet|stuffed|roasted|banana pepper|serrano|habanero|flakes/],
  // Cheese snacks are a bag of puffs, not cheese.
  [/cheese (bites|crisps|puffs|curls)|crunchy cheese|whisps|moon cheese|cheetos/, (full) => <SnackBag band={/onion/.test(full) ? '#3d8b3d' : '#c0392b'} />],
  [/\bshred|mozzarella/, () => <Shreds color="#fbf3d6" />, /fresh|ball|burrata|pearls?|sticks?/],
  [/\bswiss\b/, () => <CheeseSlices holes color="#f8e9a8" />],
  [/cheese.*\bslices?\b|\bsliced\b.*cheese|\bslices?\b.*cheese/, (full) => <CheeseSlices holes={false} color={/cheddar|american/.test(full) ? '#f3a73b' : '#f6ebc4'} />],
  [/prosciutto|jam[oó]n|serrano ham|\bserrano\b/, () => <HamLeg />],
  [/kalamata/, () => <Olives color="#3a2433" shine="#9a7a95" />],
  [/\bolives?\b/, () => <Olives color="#7d9a3a" shine="#c9dc8f" />, /oil|tapenade/],
]

/** A food button's picture: a drawing where one helps, otherwise an emoji from the name. */
export function FoodIcon({ food }: { food: Food }) {
  const full = `${food.brand ?? ''} ${food.name}`.toLowerCase()
  const unit = food.unit_conversions[0]?.unit.toLowerCase() ?? ''
  // The serving counts too: cheese whose serving is "1 slice" is sliced.
  const hit = DRAWN.find(([re, , not]) => re.test(`${full} ${unit}`) && !not?.test(full))
  return hit ? <>{hit[1](full, unit)}</> : <>{foodIcon(food)}</>
}
