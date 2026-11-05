import type { Food, LogEntry } from './foods'
import { vitaminCoverage, type Micro } from './micros'
import { addNutrients, type NutrientKey, type Nutrients } from './nutrients'
import { richestFoods, swapFor, usualFoods, type Suggestion } from './suggest'
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
  /** The daily amount to reach, for areas where low is the problem. */
  target?: number
  /** A vitamin or trace mineral, where low can just mean missing data. */
  micro?: boolean
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

export const microArea = (m: Micro, target: number): Area => ({ ...nutrientArea(m.key, m.label, m.unit, 'higher', [m.key], m.why), target, micro: true })

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
  /** Your daily net carb limit, so nothing suggested goes past it. */
  netCarbLimit: number
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
  omegaRatio: 'Cook with olive or avocado oil, and check mayo and dressings for soybean or canola oil.',
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

/** Omega-3 foods that are easy on keto, for when your own foods don't cover it. NIH amounts. */
const OMEGA3_IDEAS: { match: RegExp; text: string; effect: string; netCarbs: number }[] = [
  { match: /salmon/i, text: 'Try 3 oz salmon', effect: 'About +1.8 g omega-3', netCarbs: 0 },
  { match: /herring/i, text: 'Try 3 oz herring', effect: 'About +1.7 g omega-3', netCarbs: 0 },
  { match: /sardine/i, text: 'Try 3 oz sardines in olive oil', effect: 'About +1.2 g omega-3', netCarbs: 0 },
  { match: /mackerel/i, text: 'Try 3 oz Atlantic mackerel', effect: 'About +1 g omega-3', netCarbs: 0 },
  { match: /chia/i, text: 'Try 1 tbsp chia seeds', effect: 'About +2.1 g plant omega-3, which counts for less than fish', netCarbs: 0.9 },
  { match: /flax/i, text: 'Try 1 tbsp flaxseed', effect: 'About +2.3 g plant omega-3, which counts for less than fish', netCarbs: 0.2 },
]
const MAX_IDEAS = 3

const IDEA = {
  avocado: { match: /avocado/i, text: 'Try 1/2 avocado', netCarbs: 1.8 },
  spinach: { match: /spinach/i, text: 'Try 1/2 cup cooked spinach', netCarbs: 1.2 },
  broccoli: { match: /broccoli/i, text: 'Try 1/2 cup cooked broccoli', netCarbs: 3 },
  salmon: { match: /salmon/i, text: 'Try 3 oz salmon', netCarbs: 0 },
  sardines: { match: /sardine/i, text: 'Try 3 oz sardines', netCarbs: 0 },
  pumpkinSeeds: { match: /pumpkin seed|pepita/i, text: 'Try 1 oz pumpkin seeds', netCarbs: 1.3 },
  chia: { match: /chia/i, text: 'Try 1 tbsp chia seeds', netCarbs: 0.9 },
  redPepper: { match: /red (bell )?pepper/i, text: 'Try 1/2 cup red bell pepper', netCarbs: 3 },
  egg: { match: /\beggs?\b(?! white)/i, text: 'Try 1 egg', netCarbs: 0.6 },
  sirloin: { match: /sirloin|steak/i, text: 'Try 3 oz sirloin', netCarbs: 0 },
  porkChop: { match: /pork/i, text: 'Try a 3 oz pork chop', netCarbs: 0 },
}

/** Keto-friendly foods for each area and how much that portion gives, mostly USDA amounts. */
const FOOD_IDEAS: Partial<Record<NutrientKey, [keyof typeof IDEA, number][]>> = {
  potassiumMg: [['avocado', 485], ['spinach', 419], ['sardines', 337], ['salmon', 326]],
  magnesiumMg: [['pumpkinSeeds', 166], ['spinach', 78], ['sardines', 33]],
  fiber: [['avocado', 6.7], ['chia', 4.1], ['broccoli', 2.6]],
  vitDUg: [['salmon', 11], ['sardines', 4]],
  b12Ug: [['sardines', 7.6], ['salmon', 2.4]],
  folateUg: [['spinach', 131], ['broccoli', 84], ['avocado', 81]],
  vitCMg: [['redPepper', 95], ['broccoli', 51]],
  vitKUg: [['spinach', 445], ['broccoli', 110]],
  vitAUg: [['spinach', 472], ['broccoli', 60]],
  vitEMg: [['avocado', 2.1], ['spinach', 1.9]],
  thiaminMg: [['porkChop', 0.5], ['salmon', 0.3]],
  b6Mg: [['salmon', 0.55], ['avocado', 0.26]],
  zincMg: [['sirloin', 5], ['pumpkinSeeds', 2.2]],
  seleniumUg: [['sardines', 45], ['salmon', 35], ['egg', 15]],
  cholineMg: [['egg', 147], ['salmon', 77]],
  calciumMg: [['sardines', 325], ['spinach', 122]],
  ironMg: [['spinach', 3.2], ['sirloin', 2.9], ['pumpkinSeeds', 2.5]],
}
/** Under this share of the target counts as low. */
const LOW_SHARE = 0.9
/** A food has to cover this much of the target to be worth naming. */
const WORTHWHILE_SHARE = 0.05
/** Vitamins are only called low once most of the day's calories have vitamin data. */
const MIN_VITAMIN_COVERAGE = 70

/** Better picks for foods high in omega-6, for when you don't already eat one. */
const OMEGA6_SWAPS: [RegExp, string][] = [
  [/almond|walnut|pecan|peanut|cashew|pistachio|hazelnut|brazil nut|sunflower seed|pumpkin seed|pepita|mixed nuts/i, 'macadamias, about 0.4 g omega-6 and 1.5 g net carbs in 1 oz'],
  [/mayo|aioli|dressing|ranch|vinaigrette/i, 'a version made with olive or avocado oil'],
  [/soybean oil|canola|corn oil|vegetable oil|sunflower oil|safflower|grapeseed/i, 'olive or avocado oil'],
]

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
  if (low3) return `Omega-3 is the low side: it’s under ${ai.three} g, while omega-6 is a normal amount. ${reach}`
  if (high6) return `Omega-6 is the high side: it’s over ${ai.six} g, while omega-3 is a good amount. ${reach}`
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

/** Net carbs still free today (per day on the 7-day view), never below 0, so zero-carb foods can still be suggested. */
function carbsLeft(view: AreaView): number {
  const spread = view.isWeek ? Math.max(1, new Set(view.logs.map(dayOf)).size) : 1
  const eaten = view.logs.reduce((sum, l) => sum + (l.nutrients.netCarbs ?? 0), 0) / spread
  return Math.max(0, view.netCarbLimit - eaten)
}

const carbNote = (netCarbs: number) => ` · ${fmtAmount(netCarbs, 'g')} net carbs`

const eatenNames = (view: AreaView) => view.foods.map((f) => f.name).filter((name) => view.history.some((l) => l.food_name === name))

/** Foods you eat, then foods you could try, for an area that's running low. */
function lowAdvice(area: Area, view: AreaView, current: number, already: Advice[]): Advice[] {
  const target = area.target!
  if (current >= target * LOW_SHARE) return []
  if (area.micro && vitaminCoverage(view.logs.map((l) => l.nutrients)) < MIN_VITAMIN_COVERAGE)
    return [{ kind: 'note', text: 'Too many of these foods have no vitamin data yet to say this is low.' }]
  const key = area.parts[0].key
  const name = area.micro ? area.label : area.label.toLowerCase()
  const left = carbsLeft(view)
  const yours = richestFoods(key, target * WORTHWHILE_SHARE, usualFoods(view.foods, view.history), (n) => (n.netCarbs ?? 0) <= left).filter((f) => !already.some((a) => a.text.includes(f.name)))
  const out: Advice[] = yours.map((f) => {
    const gain = f.n[key] as number
    return { kind: 'add', text: f.text, effect: `+${fmtAmount(gain, area.unit)} ${name}, gets you to ${fmtAmount(current + gain, area.unit)} of ${fmtAmount(target, area.unit)}${carbNote(f.n.netCarbs ?? 0)}` }
  })
  const eaten = eatenNames(view)
  const ideas = (FOOD_IDEAS[key] ?? []).filter(([idea]) => IDEA[idea].netCarbs <= left && !eaten.some((n) => IDEA[idea].match.test(n))).slice(0, Math.max(1, MAX_IDEAS - yours.length))
  for (const [idea, amount] of ideas) out.push({ kind: 'add', text: IDEA[idea].text, effect: `About +${fmtAmount(amount, area.unit)} ${name}${carbNote(IDEA[idea].netCarbs)}` })
  if (!out.length && !already.length && left < 1) out.push({ kind: 'note', text: 'You’re at your net carb limit, so nothing to add today.' })
  return out
}

export function areaAdvice(area: Area, view: AreaView, insight: AreaInsight): Advice[] {
  const out: Advice[] = [...tipsFor(view.tips, area.goals)]
  if (area.target != null) out.push(...lowAdvice(area, view, insight.current ?? 0, out))
  const key = area.watchKey
  // No omega-3 logged means no ratio to flag, but it's the case that most needs help.
  const noOmega3 = key === 'omegaRatio' && insight.current == null && insight.parts[0].total > 0
  if (!key || !(area.flagged || insight.change === 'higher' || noOmega3)) return out
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
    const six1 = six.total / spread
    const three1 = three.total / spread
    out.push({ kind: 'note', text: omegaVerdict(six1, three1, limit, view.sex, view.age) })
    const over = (insight.current ?? Infinity) > limit
    if (!over && three1 >= omegaIntakes(view.sex, view.age).three) return out
    // Foods you eat first, skipping any with so much omega-6 that they'd make the ratio worse.
    const left = carbsLeft(view)
    const yours = richestFoods('omega3', 0.2, usual, (n) => (n.omega6 ?? 0) <= limit * (n.omega3 ?? 0) && (n.netCarbs ?? 0) <= left)
    for (const f of yours) {
      const after = (six1 + (f.n.omega6 ?? 0)) / (three1 + (f.n.omega3 ?? 0))
      out.push({ kind: 'add', text: f.text, effect: `+${fmtAmount(f.n.omega3 ?? 0, 'g')} omega-3, ratio goes to ${fmtAmount(after, ': 1')}${carbNote(f.n.netCarbs ?? 0)}` })
    }
    const eaten = eatenNames(view)
    const ideas = OMEGA3_IDEAS.filter((i) => i.netCarbs <= left && !eaten.some((name) => i.match.test(name))).slice(0, Math.max(1, MAX_IDEAS - yours.length))
    for (const i of ideas) out.push({ kind: 'add', text: i.text, effect: `${i.effect}${carbNote(i.netCarbs)}` })
    if (!over) return out
    // Then the foods giving the most omega-6.
    let named = false
    for (const [i, food] of six.foods.slice(0, 2).entries()) {
      if (food.pct < 20) continue
      const swap = i === 0 ? swapTop(six, area.parts[0]) : null
      const better = OMEGA6_SWAPS.find(([re]) => re.test(food.name))?.[1]
      if (better) out.push({ kind: 'swap', text: `Next time, swap ${food.name} for ${better}`, effect: `${food.name} gave ${fmtAmount(food.amount, 'g')} omega-6` })
      else if (swap) out.push({ kind: 'swap', ...swap })
      named ||= !!(better || swap)
    }
    if (!named) out.push({ kind: 'note', text: WATCH_TIPS.omegaRatio })
    return out
  }
  const swap = swapTop(insight.parts[0], area.parts[0])
  out.push(swap ? { kind: 'swap', ...swap } : { kind: 'note', text: WATCH_TIPS[key] })
  return out
}
