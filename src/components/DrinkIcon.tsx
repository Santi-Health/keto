import type { ReactNode } from 'react'
import type { DrinkKey } from '../lib/drinks'

/**
 * Small drawings for the drink buttons: cans in their brand colors with the name on them, glasses of
 * water, an espresso cup, Nespresso pods, an Argentine mate, tea cups and the fairlife bottle.
 * Drawn on a 32 × 40 grid; the outline keeps light shapes visible in both themes.
 */
const OUTLINE = 'rgba(0,0,0,0.28)'
const RIM = '#c4c8ce'

type Line = { t: string; fill: string; size: number; y: number; w?: number }

/** Text squeezed to fit its width, so long names stay on the can. */
const Label = ({ t, fill, size, y, w = 15 }: Line) => (
  <text x="16" y={y} fill={fill} fontSize={size} fontWeight={800} textAnchor="middle" textLength={w} lengthAdjust="spacingAndGlyphs" fontFamily="system-ui, sans-serif">
    {t}
  </text>
)

function Can({ body, lines, extra }: { body: string; lines: Line[]; extra?: ReactNode }) {
  return (
    <>
      <rect x="7" y="4" width="18" height="33" rx="3" fill={body} stroke={OUTLINE} />
      <rect x="8.5" y="2.5" width="15" height="3" rx="1.5" fill={RIM} stroke={OUTLINE} strokeWidth="0.6" />
      <rect x="8.5" y="35.5" width="15" height="2.5" rx="1.2" fill={RIM} stroke={OUTLINE} strokeWidth="0.6" />
      {extra}
      {lines.map((l) => (
        <Label key={l.t} {...l} />
      ))}
    </>
  )
}

function Glass({ bubbles }: { bubbles?: boolean }) {
  return (
    <>
      <path d="M7.5 15 L24.5 15 L22.6 36 L9.4 36 Z" fill="#5aa9e6" opacity="0.85" />
      <path d="M6 5 L26 5 L23 37 L9 37 Z" fill="none" stroke="#8a929c" strokeWidth="1.4" strokeLinejoin="round" />
      {bubbles &&
        [
          [12, 30, 1.2],
          [18, 26, 1],
          [15, 21, 1.3],
          [20, 32, 1.1],
          [11, 23, 0.9],
        ].map(([cx, cy, r]) => <circle key={`${cx}${cy}`} cx={cx} cy={cy} r={r} fill="#fff" opacity="0.9" />)}
    </>
  )
}

/** A Nespresso OriginalLine capsule: a dome on a flat rim, with its name across it; `top` and `rim` when they differ. */
function Pod({ color, text, ink, top, rim }: { color: string; text: string; ink: string; top?: string; rim?: string }) {
  return (
    <>
      <path d="M7 30 L10.5 12 Q16 6 21.5 12 L25 30 Z" fill={color} stroke={OUTLINE} />
      {top && <path d="M10.5 12 Q16 6 21.5 12 L22.2 15.5 L9.8 15.5 Z" fill={top} />}
      <rect x="3.5" y="29.5" width="25" height="4" rx="1.6" fill={rim ?? color} stroke={OUTLINE} />
      <Label t={text} fill={ink} size={5.5} y={24} w={text.length > 3 ? 12 : 8} />
    </>
  )
}

/** A cup with a tea bag string over the rim and a tag hanging outside. */
function TeaCup({ tea, label }: { tea: string; label?: string }) {
  return (
    <>
      <path d="M24 19 q6 0 5 6 q-1 5 -6 4" fill="none" stroke="#8a929c" strokeWidth="1.6" />
      <path d="M4 15 L25 15 L23 33 Q22 36 18 36 L11 36 Q7 36 6 33 Z" fill="#f4f1ea" stroke={OUTLINE} />
      <ellipse cx="14.5" cy="16" rx="9.6" ry="2.2" fill={tea} />
      <path d="M17 16 L19 6" stroke="#8a7a5a" strokeWidth="0.7" />
      <rect x="16.5" y="2.5" width="6" height="5" rx="0.8" fill="#e8d9b0" stroke={OUTLINE} strokeWidth="0.5" />
      {label && <Label t={label} fill={tea} size={5} y={28} w={15} />}
    </>
  )
}

function Espresso() {
  return (
    <>
      <ellipse cx="16" cy="34" rx="13" ry="3" fill="#e9e5dd" stroke={OUTLINE} />
      <path d="M23 21 q5 0 4 4.5 q-1 3.5 -5 3" fill="none" stroke="#e9e5dd" strokeWidth="2" />
      <path d="M23 21 q5 0 4 4.5 q-1 3.5 -5 3" fill="none" stroke={OUTLINE} strokeWidth="0.6" />
      <path d="M7 18 L25 18 L23.5 29 Q22.5 32 19 32 L13 32 Q9.5 32 8.5 29 Z" fill="#f4f1ea" stroke={OUTLINE} />
      <ellipse cx="16" cy="18.6" rx="8.6" ry="2" fill="#b07a45" />
      <ellipse cx="14" cy="18.4" rx="3" ry="0.8" fill="#d9a46c" />
    </>
  )
}

/** An Argentine mate gourd with yerba on top and a metal bombilla. */
function Mate() {
  return (
    <>
      <path d="M20 3 L17.5 19" stroke="#b9bec5" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M18.6 2.4 L22 3.4" stroke="#b9bec5" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M9 16 Q4 22 6 30 Q8.5 37.5 16 37.5 Q23.5 37.5 26 30 Q28 22 23 16 Z" fill="#6b4a2e" stroke={OUTLINE} />
      <path d="M10 29 Q16 32 22 29" fill="none" stroke="#8a6440" strokeWidth="1" />
      <rect x="8.5" y="14" width="15" height="3.4" rx="1.4" fill="#c9ced4" stroke={OUTLINE} strokeWidth="0.6" />
      <ellipse cx="16" cy="14.4" rx="6.6" ry="1.5" fill="#7a8b3a" />
    </>
  )
}

/** The fairlife Nutrition Plan bottle: white, white cap, a brown chocolate band with the name. */
function FairlifeBottle() {
  return (
    <>
      <rect x="11" y="1.5" width="10" height="5" rx="1.2" fill="#fff" stroke="#8a929c" />
      <path d="M11.5 6.5 L20.5 6.5 L23 11 Q24.5 13 24.5 16 L24.5 35 Q24.5 38 21.5 38 L10.5 38 Q7.5 38 7.5 35 L7.5 16 Q7.5 13 9 11 Z" fill="#fff" stroke="#8a929c" />
      <rect x="7.5" y="20" width="17" height="10" fill="#5a3825" />
      <Label t="fairlife" fill="#fff" size={4.6} y={26.6} w={14} />
    </>
  )
}

const DRAWINGS: Partial<Record<DrinkKey | 'espresso', () => ReactNode>> = {
  water: () => <Glass />,
  sparkling_water: () => <Glass bubbles />,
  sparkling_rain: () => (
    <Can
      body="#cfe8f7"
      lines={[{ t: 'Rain', fill: '#1f5f8b', size: 6.5, y: 24, w: 14 }]}
      extra={[
        [12, 11],
        [19, 12.5],
        [15.5, 29],
      ].map(([x, y]) => (
        <path key={x} d={`M${x} ${y - 2.6} Q${x + 1.7} ${y} ${x} ${y + 1.2} Q${x - 1.7} ${y} ${x} ${y - 2.6} Z`} fill="#5aa9e6" />
      ))}
    />
  ),
  coke_zero: () => (
    <Can
      body="#1b1b1b"
      lines={[
        { t: 'Coke', fill: '#e4002b', size: 7, y: 20, w: 15 },
        { t: 'Zero', fill: '#fff', size: 5, y: 27, w: 12 },
      ]}
    />
  ),
  diet_coke: () => (
    <Can
      body="#dcdee1"
      lines={[
        { t: 'Diet', fill: '#e4002b', size: 5.5, y: 17, w: 11 },
        { t: 'Coke', fill: '#e4002b', size: 7, y: 25, w: 15 },
      ]}
    />
  ),
  diet_pepsi: () => (
    <Can
      body="#e3e8ef"
      extra={
        <>
          <circle cx="16" cy="12.5" r="4" fill="#fff" stroke="#1f4fa0" strokeWidth="0.6" />
          <path d="M12 12.5 A4 4 0 0 1 20 12.5 Q16 11 12 12.5 Z" fill="#e4002b" />
          <path d="M12 12.8 Q16 15 20 12.8 A4 4 0 0 1 12 12.8 Z" fill="#1f4fa0" />
        </>
      }
      lines={[
        { t: 'Pepsi', fill: '#1f4fa0', size: 6.5, y: 24, w: 15 },
        { t: 'Diet', fill: '#1f4fa0', size: 4.6, y: 30.5, w: 10 },
      ]}
    />
  ),
  squirt_zero: () => (
    <Can
      body="#ffe14d"
      lines={[
        { t: 'Squirt', fill: '#1e8a3a', size: 6.5, y: 20, w: 15 },
        { t: 'Zero', fill: '#1b1b1b', size: 5, y: 27, w: 12 },
      ]}
    />
  ),
  fanta_zero: () => (
    <Can
      body="#ff8200"
      lines={[
        { t: 'Fanta', fill: '#1d4f9c', size: 7, y: 20, w: 15 },
        { t: 'Zero', fill: '#fff', size: 5, y: 27, w: 12 },
      ]}
    />
  ),
  sprite_zero: () => (
    <Can
      body="#00a651"
      lines={[
        { t: 'Sprite', fill: '#fff', size: 6.5, y: 20, w: 15 },
        { t: 'Zero', fill: '#ffe600', size: 5, y: 27, w: 12 },
      ]}
    />
  ),
  espresso: () => <Espresso />,
  kazar: () => <Pod color="#1d2a52" text="Kazaar" ink="#fff" />,
  // From the user's photo: the decaf is black with a copper-red band and red DECAFFEINATO; BA Lungo is gunmetal.
  volluto_decaf: () => <Pod color="#1c1a1a" text="Decaf" ink="#e0412a" rim="#8a3a22" />,
  ba_lungo: () => <Pod color="#46464c" top="#8c8c93" text="BA" ink="#fff" rim="#9a9aa0" />,
  mate_cocido: () => <Mate />,
  te_con_leche: () => <TeaCup tea="#c9a27e" />,
  rooibos: () => <TeaCup tea="#d9622b" label="Rooibos" />,
  fairlife_choc_bottle: () => <FairlifeBottle />,
}

/** The drawing for a drink, or its color dot when it has none. */
export function DrinkIcon({ drink, color }: { drink: DrinkKey; color: string }) {
  const draw = DRAWINGS[drink.startsWith('espresso') ? 'espresso' : drink]
  if (!draw) return <span className="drink-dot" style={{ background: color }} aria-hidden="true" />
  return (
    <svg className="drink-icon" viewBox="0 0 32 40" aria-hidden="true">
      {draw()}
    </svg>
  )
}
