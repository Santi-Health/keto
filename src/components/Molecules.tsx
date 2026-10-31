/**
 * Ball-and-stick molecule drawings in CPK colors (carbon gray, oxygen red, nitrogen blue,
 * phosphorus orange), simplified to 2D and without hydrogens, sized for small icons.
 */

type El = 'C' | 'O' | 'N' | 'P' | 'Na' | 'K' | 'Mg'

interface Atom {
  x: number
  y: number
  el: El
  /** Shown next to the atom, e.g. "−" or "OH". */
  label?: string
}

interface MoleculeDef {
  name: string
  formula: string
  atoms: Atom[]
  /** [from, to, order] by atom index. */
  bonds: [number, number, 1 | 2][]
  viewBox: string
}

const RADIUS: Record<El, number> = { C: 3.1, O: 3.5, N: 3.5, P: 4.2, Na: 9, K: 10, Mg: 8 }

/** Element colors as CSS variables so they can shift a little in dark mode. */
const FILL: Record<El, string> = {
  C: 'var(--atom-c)',
  O: 'var(--atom-o)',
  N: 'var(--atom-n)',
  P: 'var(--atom-p)',
  Na: 'var(--atom-na)',
  K: 'var(--atom-k)',
  Mg: 'var(--atom-mg)',
}

// Hexagon helper: vertex i of a ring centered at (cx, cy), pointy-top.
const hex = (cx: number, cy: number, r: number, i: number) => ({
  x: cx + r * Math.cos(((-90 + 60 * i) * Math.PI) / 180),
  y: cy + r * Math.sin(((-90 + 60 * i) * Math.PI) / 180),
})
const out = (cx: number, cy: number, p: { x: number; y: number }, len: number) => {
  const dx = p.x - cx
  const dy = p.y - cy
  const d = Math.hypot(dx, dy)
  return { x: p.x + (dx / d) * len, y: p.y + (dy / d) * len }
}

function glucose(): MoleculeDef {
  // β-D-glucopyranose: ring of five carbons and one oxygen, four OH groups and a CH2OH arm.
  const c = { x: 32, y: 28 }
  const ring = [0, 1, 2, 3, 4, 5].map((i) => hex(c.x, c.y, 11, i))
  const atoms: Atom[] = ring.map((p, i) => ({ ...p, el: i === 1 ? 'O' : 'C' }))
  const bonds: MoleculeDef['bonds'] = [0, 1, 2, 3, 4, 5].map((i) => [i, (i + 1) % 6, 1])
  for (const i of [2, 3, 4, 5]) {
    atoms.push({ ...out(c.x, c.y, ring[i], 8.5), el: 'O' })
    bonds.push([i, atoms.length - 1, 1])
  }
  const c6 = { x: ring[0].x - 7, y: ring[0].y - 7 }
  atoms.push({ ...c6, el: 'C' }, { x: c6.x + 9, y: c6.y - 4, el: 'O' })
  bonds.push([0, atoms.length - 2, 1], [atoms.length - 2, atoms.length - 1, 1])
  return { name: 'Glucose', formula: 'C₆H₁₂O₆', atoms, bonds, viewBox: '6 4 52 46' }
}

function alanine(): MoleculeDef {
  // H2N–CH(CH3)–COOH: amine nitrogen, alpha carbon with a methyl side chain, carboxyl group.
  const atoms: Atom[] = [
    { x: 10, y: 30, el: 'N' },
    { x: 22, y: 23, el: 'C' },
    { x: 22, y: 10, el: 'C' },
    { x: 34, y: 30, el: 'C' },
    { x: 34, y: 43, el: 'O' },
    { x: 46, y: 23, el: 'O' },
  ]
  return {
    name: 'Alanine (an amino acid)',
    formula: 'C₃H₇NO₂',
    atoms,
    bonds: [
      [0, 1, 1],
      [1, 2, 1],
      [1, 3, 1],
      [3, 4, 2],
      [3, 5, 1],
    ],
    viewBox: '2 2 52 48',
  }
}

function leucine(): MoleculeDef {
  // (CH3)2CH–CH2–CH(NH2)–COOH: the branched-chain amino acid that switches on muscle building.
  const atoms: Atom[] = [
    { x: 6, y: 15, el: 'C' },
    { x: 6, y: 35, el: 'C' },
    { x: 16, y: 25, el: 'C' },
    { x: 28, y: 18, el: 'C' },
    { x: 40, y: 25, el: 'C' },
    { x: 40, y: 38, el: 'N' },
    { x: 52, y: 18, el: 'C' },
    { x: 52, y: 5, el: 'O' },
    { x: 63, y: 25, el: 'O' },
  ]
  return {
    name: 'Leucine (an essential amino acid)',
    formula: 'C₆H₁₃NO₂',
    atoms,
    bonds: [
      [0, 2, 1],
      [1, 2, 1],
      [2, 3, 1],
      [3, 4, 1],
      [4, 5, 1],
      [4, 6, 1],
      [6, 7, 2],
      [6, 8, 1],
    ],
    viewBox: '0 0 70 44',
  }
}

function fattyAcid(): MoleculeDef {
  // A saturated fatty acid tail (zigzag carbons) ending in a carboxyl head.
  const atoms: Atom[] = []
  const bonds: MoleculeDef['bonds'] = []
  for (let i = 0; i < 7; i++) {
    atoms.push({ x: 5 + i * 7.5, y: i % 2 ? 22 : 30, el: 'C' })
    if (i) bonds.push([i - 1, i, 1])
  }
  const last = atoms[6]
  atoms.push({ x: last.x + 1, y: last.y + 12, el: 'O' }, { x: last.x + 7.5, y: last.y - 8, el: 'O' })
  bonds.push([6, 7, 2], [6, 8, 1])
  return { name: 'Fatty acid (stearic acid shown shortened)', formula: 'C₁₈H₃₆O₂', atoms, bonds, viewBox: '0 6 62 42' }
}

function atpTail(): MoleculeDef {
  // The triphosphate tail of ATP: three phosphorus atoms bridged by oxygens. Breaking off the
  // last phosphate is how cells spend energy.
  const atoms: Atom[] = []
  const bonds: MoleculeDef['bonds'] = []
  let prevBridge = -1
  for (const [i, x] of [12, 30, 48].entries()) {
    const p = atoms.push({ x, y: 27, el: 'P' }) - 1
    const up = atoms.push({ x, y: 14, el: 'O' }) - 1
    const down = atoms.push({ x, y: 40, el: 'O' }) - 1
    bonds.push([p, up, 2], [p, down, 1])
    if (prevBridge >= 0) bonds.push([prevBridge, p, 1])
    if (i < 2) {
      prevBridge = atoms.push({ x: x + 9, y: 27, el: 'O' }) - 1
      bonds.push([p, prevBridge, 1])
    }
  }
  return { name: 'ATP phosphate tail (cell energy)', formula: 'ATP', atoms, bonds, viewBox: '2 6 58 42' }
}

function bhb(): MoleculeDef {
  // β-hydroxybutyrate, CH3–CH(OH)–CH2–COO⁻: the main ketone body a blood meter reads.
  const atoms: Atom[] = [
    { x: 8, y: 30, el: 'C' },
    { x: 19, y: 23, el: 'C' },
    { x: 19, y: 10, el: 'O' },
    { x: 30, y: 30, el: 'C' },
    { x: 41, y: 23, el: 'C' },
    { x: 41, y: 10, el: 'O' },
    { x: 52, y: 30, el: 'O', label: '−' },
  ]
  return {
    name: 'β-hydroxybutyrate (BHB)',
    formula: 'C₄H₇O₃⁻',
    atoms,
    bonds: [
      [0, 1, 1],
      [1, 2, 1],
      [1, 3, 1],
      [3, 4, 1],
      [4, 5, 2],
      [4, 6, 1],
    ],
    viewBox: '2 3 60 36',
  }
}

function cellulose(): MoleculeDef {
  // Two glucose rings joined by a β-1,4 oxygen bridge: the repeating unit of cellulose fiber.
  const atoms: Atom[] = []
  const bonds: MoleculeDef['bonds'] = []
  const rings = [
    { x: 17, y: 26 },
    { x: 45, y: 26 },
  ]
  rings.forEach((c, r) => {
    const base = atoms.length
    ;[0, 1, 2, 3, 4, 5].forEach((i) => atoms.push({ ...hex(c.x, c.y, 9, i), el: i === 1 ? 'O' : 'C' }))
    ;[0, 1, 2, 3, 4, 5].forEach((i) => bonds.push([base + i, base + ((i + 1) % 6), 1]))
    if (r === 0) {
      const bridge = atoms.push({ x: 31, y: 33, el: 'O' }) - 1
      bonds.push([base + 2, bridge, 1])
    }
  })
  const bridge = atoms.findIndex((a) => a.x === 31)
  bonds.push([bridge, 7 + 4, 1])
  return { name: 'Cellulose (fiber)', formula: '(C₆H₁₀O₅)ₙ', atoms, bonds, viewBox: '4 12 54 28' }
}

function ion(el: El, charge: string, name: string): MoleculeDef {
  return { name, formula: `${el}${charge}`, atoms: [{ x: 14, y: 14, el, label: el }], bonds: [], viewBox: '0 0 28 28' }
}

export const MOLECULES = {
  glucose: glucose(),
  protein: alanine(),
  leucine: leucine(),
  fat: fattyAcid(),
  energy: atpTail(),
  ketone: bhb(),
  fiber: cellulose(),
  sodium: ion('Na', '⁺', 'Sodium ion'),
  potassium: ion('K', '⁺', 'Potassium ion'),
  magnesium: ion('Mg', '²⁺', 'Magnesium ion'),
}

export type MoleculeKey = keyof typeof MOLECULES

function Bond({ a, b, order }: { a: Atom; b: Atom; order: 1 | 2 }) {
  if (order === 1) return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
  // Double bond: two lines offset perpendicular to the bond.
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy)
  const ox = (-dy / d) * 1.4
  const oy = (dx / d) * 1.4
  return (
    <>
      <line x1={a.x + ox} y1={a.y + oy} x2={b.x + ox} y2={b.y + oy} />
      <line x1={a.x - ox} y1={a.y - oy} x2={b.x - ox} y2={b.y - oy} />
    </>
  )
}

interface Props {
  molecule: MoleculeKey
  size?: number
  showFormula?: boolean
}

export function Molecule({ molecule, size = 44, showFormula }: Props) {
  const m = MOLECULES[molecule]
  const isIon = m.bonds.length === 0
  return (
    <span className="molecule" title={`${m.name} · ${m.formula}`}>
      <svg viewBox={m.viewBox} width={size} height={isIon ? size : (size * 3) / 4} role="img" aria-label={`${m.name}, ${m.formula}`}>
        <g stroke="var(--bond)" strokeWidth={1.5} strokeLinecap="round">
          {m.bonds.map(([i, j, order], k) => (
            <Bond key={k} a={m.atoms[i]} b={m.atoms[j]} order={order} />
          ))}
        </g>
        {m.atoms.map((a, k) => (
          <g key={k}>
            <circle cx={a.x} cy={a.y} r={RADIUS[a.el]} fill={FILL[a.el]} />
            {/* Highlight for a bit of depth */}
            <circle cx={a.x - RADIUS[a.el] * 0.35} cy={a.y - RADIUS[a.el] * 0.35} r={RADIUS[a.el] * 0.35} fill="#fff" opacity={0.35} />
            {a.label && isIon && (
              <text x={a.x} y={a.y + 3.2} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#fff">
                {a.label}
              </text>
            )}
            {a.label && !isIon && (
              <text x={a.x + 4.5} y={a.y - 3} fontSize={8} fontWeight={700} fill="var(--atom-o)">
                {a.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      {showFormula && <span className="formula">{m.formula}</span>}
    </span>
  )
}
