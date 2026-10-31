import type { Exercise } from './exercise'
import type { LogEntry } from './foods'
import { POPULATION_SIGMA, estimateKetosis, populationFromFeatures, type KetoAdjuster, type KetoFeatures } from './ketosis'
import type { ReadingRow } from './readings'

/**
 * Personal ketosis model: a small Bayesian linear regression on how far each blood ketone reading
 * landed from the population estimate (on a log scale, so "30% higher" is the same at 0.3 or 1.5).
 * Each weight starts at zero (= trust the population estimate) and moves only as readings back it up,
 * so a handful of readings nudges the estimate and a few weeks of them take over.
 */

const NAMES = ['overall', 'carbs', 'carryOver', 'fasting', 'hardExercise', 'protein'] as const
type Weight = (typeof NAMES)[number]

/** Feature scaling: one unit = 25 g carbs, 50 g carry-over, 12 h fasting, a hard session, +100% protein. */
const toX = (f: KetoFeatures): number[] => [1, f.carbs24h / 25, f.carryOver / 50, f.fastH / 12, f.hardExercise, f.proteinRatio - 1]

/** Prior SD of each weight (log scale). The overall offset may move more than the specific effects. */
const PRIOR_SD = [0.7, 0.35, 0.35, 0.35, 0.35, 0.35]
/** Reading-to-reading noise (meter error and day-to-day variation), log scale. */
const NOISE_SD = 0.35

export interface KetoPoint {
  id: string
  at: number
  actual: number
  /** What the app showed when the reading was taken (stored with it). */
  predictedThen: number | null
  population: number
  /** Personal prediction with this reading left out of the fit (honest accuracy). */
  personal: number | null
  features: KetoFeatures
}

export interface CarbLimitAdvice {
  ready: boolean
  readingsNeeded: number
  daysNeeded: number
  limitG: number | null
  text: string
}

export interface KetoModel {
  n: number
  days: number
  weights: Record<Weight, number>
  adjuster: KetoAdjuster | null
  points: KetoPoint[]
  /** Mean absolute error in mmol/L. */
  populationError: number | null
  personalError: number | null
  findings: string[]
  advice: CarbLimitAdvice
  confidence: 'none' | 'learning' | 'early' | 'solid'
}

/** Solves A·x = b by Gaussian elimination with partial pivoting (A is small and well conditioned). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const k = M[r][c] / M[c][c]
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

interface Fit {
  beta: number[]
  /** Posterior precision matrix. */
  A: number[][]
}

function fit(xs: number[][], rs: number[]): Fit {
  const k = PRIOR_SD.length
  const A = PRIOR_SD.map((sd, i) => PRIOR_SD.map((_, j) => (i === j ? 1 / sd ** 2 : 0)))
  const b = new Array(k).fill(0)
  xs.forEach((x, n) => {
    for (let i = 0; i < k; i++) {
      b[i] += (x[i] * rs[n]) / NOISE_SD ** 2
      for (let j = 0; j < k; j++) A[i][j] += (x[i] * x[j]) / NOISE_SD ** 2
    }
  })
  return { beta: solve(A, b), A }
}

const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0)
const pct = (logEffect: number) => Math.round((Math.exp(logEffect) - 1) * 100)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

export function fitKetoModel(opts: {
  readings: ReadingRow[]
  logs: LogEntry[]
  exercises: Exercise[]
  netCarbLimit: number
  proteinTarget: number
}): KetoModel {
  const { readings, logs, exercises, netCarbLimit, proteinTarget } = opts
  const ketones = readings
    .filter((r) => r.kind === 'blood_ketone' && r.value != null)
    .sort((a, b) => a.taken_at.localeCompare(b.taken_at))

  // Recompute the population estimate from today's logs, so later edits to meals are reflected.
  const rows = ketones.map((r) => {
    const at = Date.parse(r.taken_at)
    const e = estimateKetosis({ at, logs, exercises, netCarbLimit, proteinTarget })
    const actual = r.value as number
    return {
      id: r.id,
      at,
      actual,
      predictedThen: r.predicted_value,
      population: e.populationMid,
      features: e.features,
      x: toX(e.features),
      // Meters read 0.0–0.1 at the bottom; treat anything lower as 0.05 so the log stays finite.
      r: Math.log(Math.max(0.05, actual)) - Math.log(e.populationMid),
    }
  })
  const n = rows.length
  const days = n ? Math.round((rows[n - 1].at - rows[0].at) / 86_400_000) : 0

  const full = fit(rows.map((p) => p.x), rows.map((p) => p.r))
  const weights = Object.fromEntries(NAMES.map((name, i) => [name, full.beta[i]])) as Record<Weight, number>

  // Leave-one-out predictions: each reading predicted by a model that never saw it.
  const points: KetoPoint[] = rows.map((p, i) => {
    const others = rows.filter((_, j) => j !== i)
    const f = n >= 2 ? fit(others.map((o) => o.x), others.map((o) => o.r)) : null
    return {
      id: p.id,
      at: p.at,
      actual: p.actual,
      predictedThen: p.predictedThen,
      population: p.population,
      personal: f ? Math.round(p.population * Math.exp(dot(f.beta, p.x)) * 100) / 100 : null,
      features: p.features,
    }
  })
  const mae = (get: (p: KetoPoint) => number | null) => {
    const errs = points.map((p) => (get(p) == null ? null : Math.abs(p.actual - (get(p) as number)))).filter((x): x is number => x != null)
    return errs.length ? Math.round((errs.reduce((a, b) => a + b, 0) / errs.length) * 100) / 100 : null
  }

  // Range width: residual spread, blended with the population spread until there's enough data.
  const sse = rows.reduce((s, p) => s + (p.r - dot(full.beta, p.x)) ** 2, 0)
  const residualSd = Math.sqrt((POPULATION_SIGMA ** 2 * 3 + sse) / (3 + n))
  const overallSd = Math.sqrt(solve(full.A, [1, 0, 0, 0, 0, 0])[0])
  const sigma = Math.min(0.6, Math.max(0.2, Math.sqrt(residualSd ** 2 + overallSd ** 2)))

  const adjuster: KetoAdjuster | null = n
    ? {
        adjust: (f) => dot(full.beta, toX(f)),
        sigma,
        n,
        reason: (_f, logAdj) => {
          const p = pct(logAdj)
          if (Math.abs(p) < 5) return `Checked against your ${n} blood reading${n > 1 ? 's' : ''}: on track with the general estimate.`
          return `Personalized from your ${n} blood reading${n > 1 ? 's' : ''}: ${Math.abs(p)}% ${p > 0 ? 'higher' : 'lower'} than the general estimate for a day like this.`
        },
      }
    : null

  // Plain-language findings, only once there's enough data and the effect is meaningful.
  const findings: string[] = []
  if (n >= 3 && Math.abs(pct(weights.overall)) >= 15)
    findings.push(`Overall, your ketones run about ${Math.abs(pct(weights.overall))}% ${weights.overall > 0 ? 'higher' : 'lower'} than the general estimate.`)
  if (n >= 6) {
    const effect = (w: number, text: (p: number, up: boolean) => string) => {
      const p = pct(w)
      if (Math.abs(p) >= 15) findings.push(text(Math.abs(p), p > 0))
    }
    effect(weights.hardExercise, (p, up) => `Hard workouts move your ketones ${p}% ${up ? 'more' : 'less'} than typical.`)
    effect(weights.fasting, (p, up) => `Each extra 12 h of fasting puts your ketones ${p}% ${up ? 'above' : 'below'} what's typical.`)
    effect(weights.carbs, (p, up) => `Every extra 25 g of net carbs puts your ketones ${p}% ${up ? 'above' : 'below'} the general estimate (${up ? 'you tolerate carbs better than average' : 'you are more carb-sensitive than average'}).`)
    effect(weights.carryOver, (p, up) => `A high-carb day ${up ? 'affects you less' : 'drags on you longer'} than typical: about ${p}% ${up ? 'higher' : 'lower'} the next days.`)
    effect(0.3 * weights.protein, (p, up) => `30% more protein than your target ${up ? 'does not seem to hurt' : `lowers your ketones about ${p}%`}.`)
  }

  const advice = carbLimitAdvice(n, days, full.beta, sigma, rows.map((p) => p.features.fastH), netCarbLimit)
  const confidence = n === 0 ? 'none' : n < 3 ? 'learning' : n < 10 ? 'early' : 'solid'
  return { n, days, weights, adjuster, points, populationError: mae((p) => p.population), personalError: mae((p) => p.personal), findings, advice, confidence }
}

const MIN_READINGS = 10
const MIN_DAYS = 14

/**
 * Highest daily net carbs that still keeps the low end of your personal range at 0.5 mmol/L or more,
 * on a typical day for you (your usual fasting window, no hard workout, protein on target).
 */
function carbLimitAdvice(n: number, days: number, beta: number[], sigma: number, fasts: number[], current: number): CarbLimitAdvice {
  const readingsNeeded = Math.max(0, MIN_READINGS - n)
  const daysNeeded = Math.max(0, MIN_DAYS - days)
  if (readingsNeeded || daysNeeded) {
    return {
      ready: false,
      readingsNeeded,
      daysNeeded,
      limitG: null,
      text: `Your personal carb limit comes after ${MIN_READINGS} blood readings over ${MIN_DAYS} days: ${[
        readingsNeeded ? `${readingsNeeded} more reading${readingsNeeded > 1 ? 's' : ''}` : '',
        daysNeeded ? `${daysNeeded} more day${daysNeeded > 1 ? 's' : ''}` : '',
      ]
        .filter(Boolean)
        .join(' and ')} to go.`,
    }
  }
  const fastH = median(fasts)
  let best: number | null = null
  for (let c = 0; c <= 80; c++) {
    const f: KetoFeatures = { carbs24h: c, carryOver: 0, fastH, hardExercise: 0, proteinRatio: 1 }
    const mid = populationFromFeatures(f, current) * Math.exp(dot(beta, toX(f)))
    if (mid * Math.exp(-sigma) >= 0.5) best = c
  }
  if (best == null)
    return {
      ready: true,
      readingsNeeded: 0,
      daysNeeded: 0,
      limitG: null,
      text: 'Your readings stay low even on low-carb days, so the app can’t suggest a higher limit. Longer overnight fasts or more hard sessions may help; keep logging.',
    }
  const limitG = Math.max(10, Math.floor(best / 5) * 5)
  return {
    ready: true,
    readingsNeeded: 0,
    daysNeeded: 0,
    limitG,
    text:
      limitG === current
        ? `Your readings back up your ${current} g limit.`
        : `On a typical day for you (about ${Math.round(fastH)} h overnight fast, no hard workout), you stay reliably at 0.5 mmol/L or more up to about ${limitG} g net carbs, ${limitG > current ? 'above' : 'below'} your current ${current} g.`,
  }
}
