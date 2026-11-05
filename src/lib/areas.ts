import type { Food, LogEntry } from './foods'
import type { Micro } from './micros'
import { addNutrients, type NutrientKey, type Nutrients } from './nutrients'
import { richestFood, swapFor, usualFoods, type Suggestion } from './suggest'
import { entryDay } from './time'
import { lastDays } from './trends'
import type { Sex } from './types'
import { OFTEN_MISSING, WATCH_LIST, WATCH_PARTS, foodBreakdown, type WatchItem, type WatchKey, type WatchPart, type WatchPartSpec } from './watchlist'

/**
 * What opens when you tap a macro, bar, vitamin or watch item: the foods behind it, how it compares
 * with your usual, and what to change. "Usual" is your own average over the logged days of the
 * 4 weeks before the day on screen, so a day never counts toward its own baseline.
 */

const BASELINE_DAYS = 28
const RECENT_DAYS = 7
/** Fewer logged days than this isn't a baseline yet. */
export const MIN_BASELINE_DAYS = 5
const MIN_TREND_DAYS = 3
/** Within this of your usual counts as normal. */
const NORMAL_BAND = 0.2
const STEADY_BAND = 0.1

export interface Area {
  id: string
  label: string
  unit: string
  parts: WatchPartSpec[]
  value: (t: Required<Nutrients>) => number | null
  /** Which way is good; null when neither is (fat, calories, sodium). */
  better: 'lower' | 'higher' | null
  /** Suggestion goals that belong here. */
  goals: string[]
  why: string
  watchKey?: WatchKey
  /** Counted over 7 days, like mercury. */
  weekly?: boolean
  /** Near or over its limit, so it's worth advice. */
  flagged?: boolean
  limit?: number | null
}

const nutrientArea = (key: NutrientKey, label: string, unit: string, better: Area['better'], goals: string[], why: string): Area => ({
  id: key,
  label,
  unit,
  parts: [{ key, label, unit }],
  value: (t) => t[key] as number,
  better,
  goals,
  why,
})

export const AREAS = {
  netCarbs: nutrientArea('netCarbs', 'Net carbs', 'g', 'lower', ['netCarbs'], 'Keeping these under your limit keeps you in ketosis.'),
  protein: nutrientArea('protein', 'Protein', 'g', 'higher', ['protein', 'leucine'], 'Protects muscle while you lose fat. Leucine tips show here too.'),
  fat: nutrientArea('fat', 'Fat', 'g', null, ['fat'], 'Fat fills the calories left after protein and carbs.'),
  kcal: nutrientArea('kcal', 'Calories', 'kcal', null, ['calories'], 'Everything you ate, against your daily limit.'),
  sodium: nutrientArea('sodiumMg', 'Sodium', 'mg', null, ['sodium'], 'Keto flushes sodium, so it’s a target here, not only a limit.'),
  potassium: nutrientArea('potassiumMg', 'Potassium', 'mg', 'higher', ['potassium'], 'Runs low on keto; helps with cramps and blood pressure.'),
  magnesium: nutrientArea('magnesiumMg', 'Magnesium', 'mg', 'higher', ['magnesium'], 'Runs low on keto; helps with sleep and cramps.'),
  fiber: nutrientArea('fiber', 'Fiber', 'g', 'higher', ['fiber'], 'Keeps digestion regular on low carb.'),
}

export const microArea = (m: Micro): Area => nutrientArea(m.key, m.label, m.unit, 'higher', [m.key], m.why)

export const watchArea = (item: WatchItem): Area => ({
  id: item.key,
  label: item.label,
  unit: item.unit,
  parts: WATCH_PARTS[item.key],
  value: WATCH_LIST[item.key].value,
  better: 'lower',
  goals: [],
  why: item.guidance,
  watchKey: item.key,
  weekly: item.period === 'week',
  flagged: item.status === 'near' || item.status === 'over' || item.status === 'caution',
  limit: item.limit,
})

export interface AreaView {
  /** Logs of the day or days on screen. */
  logs: LogEntry[]
  /** The last 7 days, for items counted by the week. */
  weekLogs: LogEntry[]
  /** Every log, for your usual. */
  history: LogEntry[]
  foods: Food[]
  /** The days on screen, oldest first. */
  days: string[]
  isToday: boolean
  isWeek: boolean
  tips: Suggestion[]
  sex: Sex
  age: number
}

export const fmtAmount = (n: number, unit: string) =>
  unit === ': 1' ? `${n.toFixed(1)}:1` : `${n.toLocaleString(undefined, { maximumFractionDigits: unit === 'g' || n < 10 ? 1 : 0 })} ${unit}`

const dayOf = (l: LogEntry) => entryDay(l.eaten_at, l.meta?.tz)

/** The area's value for an average day of these logs. */
function perDay(area: Area, logs: LogEntry[], days: number): number | null {
  const total = addNutrients(logs.map((l) => l.nutrients))
  const avg = { ...total }
  for (const k of Object.keys(avg) as NutrientKey[]) avg[k] = (total[k] as number) / days
  return area.value(avg)
}

const direction = (now: number, then: number, band: number): 'higher' | 'lower' | 'same' =>
  Math.abs(now - then) <= then * band ? 'same' : now > then ? 'higher' : 'lower'

export interface AreaInsight {
  parts: WatchPart[]
  /** The value on screen, per day on the 7-day view. */
  current: number | null
  usual: number | null
  loggedDays: number
  change: 'higher' | 'lower' | 'same' | null
  /** Plain sentences: against your usual, then the trend, then the foods that moved it. */
  lines: string[]
}

export function areaInsight(area: Area, view: AreaView): AreaInsight {
  const logs = area.weekly ? view.weekLogs : view.logs
  const lastDay = view.days[view.days.length - 1]
  const first = area.weekly ? lastDays(7, lastDay)[0] : view.days[0]
  const parts = area.parts.map((p) => foodBreakdown(p, logs, !!area.watchKey && OFTEN_MISSING.has(area.watchKey)))
  const spread = view.isWeek && !area.weekly ? Math.max(1, new Set(logs.map(dayOf)).size) : 1
  const current = logs.length ? perDay(area, logs, spread) : null

  const window = lastDays(BASELINE_DAYS, lastDays(2, first)[0])
  const inWindow = new Set(window)
  const byDay = new Map<string, LogEntry[]>()
  for (const l of view.history) {
    const d = dayOf(l)
    if (inWindow.has(d)) byDay.set(d, [...(byDay.get(d) ?? []), l])
  }
  const logged = window.filter((d) => byDay.has(d))
  if (logged.length < MIN_BASELINE_DAYS) return { parts, current, usual: null, loggedDays: logged.length, change: null, lines: [] }

  const weekScale = area.weekly ? 7 : 1
  const avgOf = (days: string[]) => {
    const v = perDay(area, days.flatMap((d) => byDay.get(d)!), days.length)
    return v == null ? null : v * weekScale
  }
  const usual = avgOf(logged)
  const per = area.weekly ? ' a week' : area.unit === ': 1' ? '' : ' a day'
  const lines: string[] = []
  let change: AreaInsight['change'] = null
  if (usual != null && current != null) {
    change = direction(current, usual, NORMAL_BAND)
    const when = area.weekly || view.isWeek ? 'These 7 days' : view.isToday ? 'Today so far' : 'That day'
    const was = fmtAmount(current, area.unit)
    const norm = `${fmtAmount(usual, area.unit)}${per}`
    lines.push(change === 'same' ? `About normal: ${was}, and your usual is ${norm}.` : `${when}: ${was}, ${change === 'higher' ? 'above' : 'below'} your usual ${norm}.`)
  } else if (usual != null) {
    lines.push(`Your usual is ${fmtAmount(usual, area.unit)}${per}.`)
  }

  // Past week against the three before it, in the days before the one on screen.
  const recent = window.slice(-RECENT_DAYS).filter((d) => byDay.has(d))
  const older = window.slice(0, -RECENT_DAYS).filter((d) => byDay.has(d))
  if (!view.isWeek && !area.weekly && recent.length >= MIN_TREND_DAYS && older.length >= MIN_TREND_DAYS) {
    const now = avgOf(recent)
    const then = avgOf(older)
    if (now != null && then != null) {
      const dir = direction(now, then, STEADY_BAND)
      const verdict = dir === 'same' ? 'steady' : area.better == null ? (dir === 'higher' ? 'going up' : 'going down') : (dir === 'higher') === (area.better === 'higher') ? 'improving' : 'getting worse'
      lines.push(`Trend: ${fmtAmount(now, area.unit)} over the last 7 days against ${fmtAmount(then, area.unit)} before, ${verdict}.`)
    }
  }

  // The foods behind the change, against how much of each you usually have.
  if (change && change !== 'same' && !area.weekly) {
    for (const part of parts) {
      const baseline = foodBreakdown(area.parts[parts.indexOf(part)], logged.flatMap((d) => byDay.get(d)!))
      const usualOf = (name: string) => (baseline.foods.find((f) => f.name === name)?.amount ?? 0) / logged.length
      const moved = part.foods
        .map((f) => ({ name: f.name, delta: f.amount / spread - usualOf(f.name) }))
        .filter((f) => f.delta > 0 && f.delta >= (baseline.total / logged.length) * 0.1)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 2)
      if (moved.length && change === 'higher') lines.push(`More ${part.label === area.label ? '' : `${part.label.toLowerCase()} `}than usual from ${moved.map((f) => `${f.name} (+${fmtAmount(f.delta, part.unit)})`).join(', ')}.`)
      // A half-eaten day hasn't "dropped" anything yet.
      if (!view.isToday) {
        const here = new Set(part.foods.map((f) => f.name))
        const gone = baseline.foods.filter((f) => !here.has(f.name) && f.amount / logged.length >= (baseline.total / logged.length) * 0.15)[0]
        if (gone) lines.push(`Missing compared with usual: ${gone.name}, about ${fmtAmount(gone.amount / logged.length, part.unit)} of ${part.label.toLowerCase()} on an average day.`)
      }
    }
  }
  return { parts, current, usual, loggedDays: logged.length, change, lines }
}

// --- What to change ------------------------------------------------------------------------

/** When none of your own foods make a better swap. */
const WATCH_TIPS: Record<WatchKey, string> = {
  satFat: 'Move some butter, cheese or fatty cuts over to olive oil, avocado or fish.',
  transFat: 'Check labels for partially hydrogenated oils and skip those products.',
  addedSugars: 'Look for a version with no added sugar.',
  cholesterol: 'No need to cut this on its own. Compare it with your lipid labs.',
  omegaRatio: 'Cook with olive or avocado oil, pick macadamias over almonds or walnuts, and check mayo and dressings for soybean or canola oil.',
  mercury: 'Next time pick a lower-mercury fish, like salmon, sardines or shrimp.',
  retinol: 'Space out liver and other organ meats.',
  heavyMetal: 'Rotate brands of protein powder and dark chocolate, and look for third-party testing.',
  alcohol: 'Have fewer drinks, or alternate with water.',
  caffeine: 'Switch a later coffee to decaf or rooibos.',
  sweeteners: 'Try sparkling water or Spindrift in place of a diet soda.',
  ultraProcessed: 'Swap one packaged item for a whole food.',
  sodiumHigh: 'Go lighter on salt and salty sauces.',
}

/** Adequate Intakes, g a day. */
const omegaIntakes = (sex: Sex, age: number) => ({
  three: sex === 'female' ? 1.1 : 1.6,
  six: sex === 'female' ? (age > 50 ? 11 : 12) : age > 50 ? 14 : 17,
})

/** Whether the ratio needs more omega-3, less omega-6, or both, and by how much. */
export function omegaVerdict(six: number, three: number, limit: number, sex: Sex, age: number): string {
  const ai = omegaIntakes(sex, age)
  const low3 = three < ai.three
  const high6 = six > ai.six
  const more3 = Math.max(0, six / limit - three)
  const less6 = Math.max(0, six - limit * three)
  if (more3 <= 0) return low3 ? `The ratio is fine, though omega-3 is under the ${ai.three} g a day to aim for.` : 'The ratio is fine, and omega-3 and omega-6 are both at good amounts.'
  const reach = `About ${more3.toFixed(1)} g more omega-3 reaches ${limit}:1${three > 0 ? `, or ${less6.toFixed(1)} g less omega-6` : ''}.`
  if (low3 && high6) return `Both: omega-3 is under ${ai.three} g and omega-6 is over ${ai.six} g. ${reach}`
  if (low3) return `Mainly more omega-3: it’s under ${ai.three} g, while omega-6 is a normal amount. ${reach}`
  if (high6) return `Mainly less omega-6: it’s over ${ai.six} g, while omega-3 is a good amount. ${reach}`
  return `Either one works: both are normal amounts, but the balance is off. ${reach}`
}

export interface Advice {
  kind: Suggestion['kind'] | 'note'
  text: string
  effect?: string
  warning?: string
}

const tipsFor = (tips: Suggestion[], goals: string[]) => tips.filter((t) => goals.some((g) => t.goal === g || t.helps?.includes(g)))

export const hasTip = (area: Area, view: AreaView) => tipsFor(view.tips, area.goals).length > 0

export function areaAdvice(area: Area, view: AreaView, insight: AreaInsight): Advice[] {
  const out: Advice[] = [...tipsFor(view.tips, area.goals)]
  const key = area.watchKey
  if (!key || !(area.flagged || insight.change === 'higher')) return out
  const logs = area.weekly ? view.weekLogs : view.logs
  const usual = usualFoods(view.foods, view.history)
  const spread = view.isWeek ? Math.max(1, new Set(logs.map(dayOf)).size) : 1
  const swapTop = (part: WatchPart, spec: WatchPartSpec) => {
    const name = part.foods[0]?.name
    if (!name) return null
    const entry = logs.filter((l) => l.food_name === name).sort((a, b) => ((b.nutrients[spec.key] as number) ?? 0) - ((a.nutrients[spec.key] as number) ?? 0))[0]
    return swapFor(entry, spec.key, spec.unit, spec.label.toLowerCase(), usual)
  }
  if (key === 'omegaRatio') {
    const [six, three] = insight.parts
    const limit = area.limit ?? 4
    out.push({ kind: 'note', text: omegaVerdict(six.total / spread, three.total / spread, limit, view.sex, view.age) })
    if ((insight.current ?? Infinity) <= limit) return out
    const swap = swapTop(six, area.parts[0])
    if (swap) out.push({ kind: 'swap', ...swap })
    const add = richestFood('omega3', 'g', 'omega-3', 0.3, usual)
    out.push(add ? { kind: 'add', ...add } : { kind: 'note', text: 'Sardines or salmon are the easiest omega-3: about 1 to 2 g in 3 oz.' })
    if (!swap) out.push({ kind: 'note', text: WATCH_TIPS.omegaRatio })
    return out
  }
  const swap = swapTop(insight.parts[0], area.parts[0])
  out.push(swap ? { kind: 'swap', ...swap } : { kind: 'note', text: WATCH_TIPS[key] })
  return out
}
