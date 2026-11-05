import { LEUCINE_PER_MEAL_G, estimateAminos, type MuscleGoal } from './aminoAcids'
import { MEALS, portionNutrients, type Food, type LogEntry, type Meal } from './foods'
import { addNutrients, type Nutrients } from './nutrients'
import { MICROS, microStatus, vitaminCoverage } from './micros'
import type { Targets } from './targets'
import type { Sex } from './types'
import { formatAmount, toGrams } from './units'
import { computeWatchList, type WatchContext, type WatchSettings } from './watchlist'

/**
 * Small, practical fixes for the day built only from ingredients you actually eat: "add 1 egg to
 * dinner" when a meal is short on leucine, "have 1 slice instead of 2" when carbs run over, or a swap
 * for something you regularly eat at that meal. Recipes, restaurant dishes and drinks (other than
 * milk) aren't suggested, since you can't add a little of them.
 */

export interface UsualFood {
  food: Food
  /** The step to suggest in: one of your usual units ("1 egg", "1 slice") or half an ounce. */
  unit: string
  step: number
  stepGrams: number
  /** Your usual portion, in steps. */
  usualSteps: number
  /** The most to suggest adding, in steps: about one more usual portion. */
  maxSteps: number
  /** Your usual portion in grams. */
  usualGrams: number
  /** A pinch of something (salt, NuSalt, turmeric): suggested only when a couple of grams fully closes a gap. */
  seasoning: boolean
  /** Meals you've eaten it at. */
  meals: Set<Meal>
  timesLogged: number
}

export interface Suggestion {
  kind: 'add' | 'trim' | 'swap'
  /** Short headline, e.g. "Add 1 egg to dinner". */
  text: string
  /** What it changes, e.g. "+0.6 g leucine (3.1 g) · +72 kcal". */
  effect: string
  /** What it fixes, for grouping: leucine, protein, fiber, potassium, magnesium, netCarbs, calories, fat. */
  goal: string
  /** Other goals an addition also closes a real part of. */
  helps?: string[]
  /** A limit it would push you past, when no food could close the gap without that. */
  warning?: string
}

const isRestaurant = (f: Food) => f.fields_estimated.includes('restaurant portions')
const isDrink = (f: Food) => !!f.meta.externalId?.startsWith('drink:') && !f.meta.externalId.startsWith('drink:milk')
const round1 = (n: number) => Math.round(n * 10) / 10
const fmtN = (v: number) => (v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? v.toFixed(0) : String(round1(v)))

/** Units you count rather than weigh ("1 egg", "slice", "pod"); weighed units step by half an ounce. */
const WEIGHED = new Set(['g', 'oz', 'ml', 'fl oz', 'cup', 'tbsp', 'tsp'])
/** Below this, a food is a seasoning (a pinch of salt or pepper), not something to eat more of. */
const SEASONING_G = 5
/** The most of a seasoning to suggest: a pinch to a couple of grams. */
const MAX_SEASONING_G = 3

/** Step size in your unit, small enough to fit your usual portion (1 g of pepper isn't stepped by 15 g). */
function stepFor(unit: string, usual: number) {
  if (!WEIGHED.has(unit)) return 1
  if (unit === 'g' || unit === 'ml') return usual >= 30 ? 15 : usual >= 10 ? 5 : 1
  if (unit === 'oz' || unit === 'fl oz') return 0.5
  if (unit === 'cup') return 0.25
  return 1
}

function usualFood(food: Food, unit: string, usual: number, meals: Set<Meal>, timesLogged: number): UsualFood | null {
  const step = stepFor(unit, usual)
  const stepGrams = toGrams({ unitConversions: food.unit_conversions }, step, unit).grams
  if (!(stepGrams > 0)) return null
  const usualSteps = Math.max(1, Math.round(usual / step))
  const usualGrams = usualSteps * stepGrams
  const seasoning = usualGrams < SEASONING_G
  // Up to one more of your usual portion (2 eggs → up to 2 more, 6 oz → up to 6 oz more); seasonings up to ~3 g.
  const maxSteps = seasoning ? Math.max(1, Math.floor(MAX_SEASONING_G / stepGrams + 1e-9)) : usualSteps
  return { food, unit, step, stepGrams, usualSteps, maxSteps, usualGrams, seasoning, meals, timesLogged }
}

/** The ingredients you eat (anything you've logged, plus starred favorites), with your usual portion. */
export function usualFoods(foods: Food[], history: LogEntry[]): UsualFood[] {
  const byId = new Map(foods.map((f) => [f.id, f]))
  const groups = new Map<string, LogEntry[]>()
  for (const l of history) if (l.food_id) groups.set(l.food_id, [...(groups.get(l.food_id) ?? []), l])
  const out: UsualFood[] = []
  for (const [id, logs] of groups) {
    const food = byId.get(id)
    if (!food || food.deleted_at || food.source === 'recipe' || isRestaurant(food) || isDrink(food)) continue
    // The unit you use most for it.
    const units = new Map<string, number[]>()
    for (const l of logs) units.set(l.unit, [...(units.get(l.unit) ?? []), l.amount])
    const [unit, amounts] = [...units.entries()].sort((a, b) => b[1].length - a[1].length)[0]
    const usual = [...amounts].sort((a, b) => a - b)[Math.floor(amounts.length / 2)]
    const u = usualFood(food, unit, usual, new Set(logs.map((l) => l.meal)), logs.length)
    if (u) out.push(u)
  }
  // Starred favorites you haven't logged yet, in their first portion size.
  for (const food of foods) {
    if (!food.favorite || food.deleted_at || groups.has(food.id) || food.source === 'recipe' || isRestaurant(food) || isDrink(food)) continue
    const unit = food.meta.lastUnit ?? food.unit_conversions[0]?.unit ?? 'g'
    const u = usualFood(food, unit, food.meta.lastAmount ?? (unit === 'g' ? 30 : 1), new Set(food.meta.meals ?? []), 0)
    if (u) out.push(u)
  }
  return out
}

const per = (u: UsualFood, steps: number): Nutrients => estimateAminos(portionNutrients(u.food, u.stepGrams * steps))
const amountText = (u: UsualFood, steps: number) => formatAmount(round1(steps * u.step), u.unit)
const mealLabel = (m: Meal) => MEALS.find((x) => x.value === m)!.label.toLowerCase()

/** Additions above this many calories aren't "a little more of something". */
const MAX_ADD_KCAL = 200

/**
 * The cheapest (in calories, with net carbs counting extra) addition from your usual foods that covers
 * `need` of a nutrient, within one more of your usual portion and about 200 kcal (seasonings: a couple of grams, full fixes only). Prefers foods
 * you eat at `meal`. When nothing covers all of it, the best one that covers at least half (`partial`).
 */
function bestAddition(usual: UsualFood[], key: keyof Nutrients, need: number, meal?: Meal, crosses: (n: Nutrients) => boolean = () => false) {
  type Pick = { u: UsualFood; steps: number; gain: number; kcal: number; carbs: number; score: number; partial: boolean }
  // Foods that would push you past a limit (saturated fat, carbs, calories…) only win when nothing else works.
  const pick = (clean: boolean) => {
  let best: Pick | null = null
  let bestPartial: Pick | null = null
  for (const u of usual) {
    const one = per(u, 1)[key] ?? 0
    if (one <= 0) continue
    const full = Math.ceil(need / one - 1e-9)
    const steps = Math.min(full, u.maxSteps)
    const n = per(u, steps)
    const kcal = n.kcal ?? 0
    if (kcal > MAX_ADD_KCAL && full > 1) continue
    if (clean && crosses(n)) continue
    const carbs = n.netCarbs ?? 0
    const gain = n[key] ?? 0
    // Calories first, net carbs weigh 20× (a keto budget), a small bonus for foods you eat at this meal.
    const score = kcal + carbs * 20 - (meal && u.meals.has(meal) ? 15 : 0) - Math.min(u.timesLogged, 10)
    if (steps === full) {
      if (!best || score < best.score) best = { u, steps, gain, kcal, carbs, score, partial: false }
    } else if (gain >= need * 0.5 && !u.seasoning) {
      // Partial: rank by how much of the gap it closes per calorie.
      const pscore = score / (gain / need)
      if (!bestPartial || pscore < bestPartial.score) bestPartial = { u, steps, gain, kcal, carbs, score: pscore, partial: true }
    }
  }
  return best ?? bestPartial
  }
  return pick(true) ?? pick(false)
}

/** A food you eat at that meal with at most half as much of `key`, known for sure, and similar protein. */
export function swapFor(entry: Pick<LogEntry, 'food_id' | 'food_name' | 'meal' | 'nutrients'>, key: keyof Nutrients, unit: string, label: string, usual: UsualFood[]): Pick<Suggestion, 'text' | 'effect'> | null {
  const was = (entry.nutrients[key] as number) ?? 0
  const protein = entry.nutrients.protein ?? 0
  const pick = usual
    .filter((u) => u.food.id !== entry.food_id && u.meals.has(entry.meal))
    .map((u) => ({ u, n: per(u, u.usualSteps) }))
    .filter((x) => x.n[key] != null && (x.n[key] as number) <= was / 2 && (x.n.protein ?? 0) >= protein * 0.6)
    .sort((a, b) => (a.n[key] as number) - (b.n[key] as number))[0]
  if (!pick) return null
  const saved = was - (pick.n[key] as number)
  return {
    text: `Next time, swap ${entry.food_name} for ${amountText(pick.u, pick.u.usualSteps)} ${pick.u.food.name} at ${mealLabel(entry.meal)}`,
    effect: `−${fmtN(saved)} ${unit} ${label}, protein ${Math.round(protein)} → ${Math.round(pick.n.protein ?? 0)} g`,
  }
}

/** The food you already eat with the most of `key` in your usual portion, when that's at least `min`. */
export function richestFood(key: keyof Nutrients, unit: string, label: string, min: number, usual: UsualFood[]): Pick<Suggestion, 'text' | 'effect'> | null {
  const best = usual
    .map((u) => ({ u, v: (per(u, u.usualSteps)[key] as number) ?? 0 }))
    .filter((x) => x.v >= min)
    .sort((a, b) => b.v - a.v)[0]
  return best ? { text: `Add ${amountText(best.u, best.u.usualSteps)} ${best.u.food.name}`, effect: `+${fmtN(best.v)} ${unit} ${label}` } : null
}

export interface SuggestInput {
  dayLogs: LogEntry[]
  history: LogEntry[]
  foods: Food[]
  targets: Targets
  muscleGoal: MuscleGoal
  fatBudget: number | null
  /** Past day: phrase as "would have done it". */
  past: boolean
  /** For vitamin targets; without it vitamins are skipped. */
  sex?: Sex
  /** Your watch list (saturated fat, added sugar, caffeine…), so additions that would pass a limit are avoided or flagged.
   * weekItems: the 6 days before this one, for weekly limits like mercury. */
  watch?: { ctx: WatchContext; settings?: WatchSettings; weekItems: Nutrients[] }
}

/** A limit an addition would push you past: "saturated fat (24 of 22 g)". */
interface Crossing {
  label: string
  text: string
}

export function suggestFixes({ dayLogs, history, foods, targets, muscleGoal, fatBudget, past, sex, watch }: SuggestInput): Suggestion[] {
  if (!dayLogs.length) return []
  const usual = usualFoods(foods, history)
  if (!usual.length) return []
  const out: Suggestion[] = []
  const add = past ? 'Adding' : 'Add'
  const would = past ? ' would have done it' : ''
  const withAminos = dayLogs.map((l) => ({ ...l, nutrients: estimateAminos(l.nutrients) }))
  const total = addNutrients(withAminos.map((l) => l.nutrients))

  // 1–2. Gaps to close by adding food. Each addition is planned on top of the ones before it, so one food
  // that covers several gaps is suggested once (with everything it helps), and a gap it already closed is skipped.
  type Gap = { goal: string; key: keyof Nutrients; label: string; unit: string; target: number; meal?: Meal; have: () => number; partialOk: boolean }
  type Plan = { u: UsualFood; steps: number; meal?: Meal; already: boolean; goals: Gap[] }
  const plans: Plan[] = []
  // Every limit the day has: net carbs, calories, fat, your watch list, and vitamin upper limits.
  const crossings = (extra: Nutrients[], mine: Nutrients): Crossing[] => {
    const after = addNutrients([total, ...extra])
    const before = addNutrients([total, ...extra.filter((n) => n !== mine)])
    const out: Crossing[] = []
    const check = (label: string, limit: number | null | undefined, get: (t: Nutrients) => number | null | undefined, unit: string) => {
      if (limit == null) return
      const a = get(after) ?? 0
      if (a > limit && a > (get(before) ?? 0) + 1e-6) out.push({ label, text: `${label} (${fmtN(a)} of ${fmtN(limit)}${unit ? ` ${unit}` : ''})` })
    }
    check('net carbs', targets.netCarbsG, (t) => t.netCarbs, 'g')
    check('calories', targets.calories, (t) => t.kcal, 'kcal')
    check('fat', fatBudget, (t) => t.fat, 'g')
    if (watch) {
      const items = (n: Nutrients[]) => computeWatchList([total, ...n], [...watch.weekItems, total, ...n], watch.ctx, watch.settings)
      const was = new Map(items(extra.filter((n) => n !== mine)).map((w) => [w.key, w.value ?? 0]))
      for (const w of items(extra))
        if (w.limit != null && w.value != null && w.value > w.limit && w.value > (was.get(w.key) ?? 0) + 1e-6)
          out.push({
            label: w.label.toLowerCase(),
            text: w.unit === ': 1'
              ? `${w.label.toLowerCase()} (${fmtN(w.value)}:1, limit ${fmtN(w.limit)}:1)`
              : `${w.label.toLowerCase()} (${fmtN(w.value)} of ${fmtN(w.limit)} ${w.unit}${w.period === 'week' ? ' this week' : ''})`,
          })
    }
    for (const m of MICROS) check(m.label, m.upper, (t) => t[m.key] as number | undefined, m.unit)
    return out
  }
  const plannedItems = () => plans.map((p) => per(p.u, p.steps))
  const planned = (key: keyof Nutrients, meal?: Meal) =>
    plans.filter((p) => !meal || p.meal === meal).reduce((sum, p) => sum + ((per(p.u, p.steps)[key] as number) ?? 0), 0)
  const dayHave = (key: keyof Nutrients) => () => ((total[key] as number) ?? 0) + planned(key)
  const gaps: Gap[] = []
  // Leucine, meal by meal.
  const leuTarget = LEUCINE_PER_MEAL_G[muscleGoal]
  for (const m of MEALS) {
    const items = withAminos.filter((l) => l.meal === m.value)
    if (!items.length) continue
    const leu = items.reduce((sum, l) => sum + (l.nutrients.leuG ?? 0), 0)
    gaps.push({ goal: 'leucine', key: 'leuG', label: `leucine at ${mealLabel(m.value)}`, unit: 'g', target: leuTarget, meal: m.value, have: () => leu + planned('leuG', m.value), partialOk: true })
  }
  // Daily nutrients that ran short.
  for (const g of [
    { key: 'protein', goal: 'protein', label: 'protein', unit: 'g', target: targets.proteinG },
    { key: 'fiber', goal: 'fiber', label: 'fiber', unit: 'g', target: targets.fiberG },
    { key: 'sodiumMg', goal: 'sodium', label: 'sodium', unit: 'mg', target: targets.sodiumMg },
    { key: 'potassiumMg', goal: 'potassium', label: 'potassium', unit: 'mg', target: targets.potassiumMg },
    { key: 'magnesiumMg', goal: 'magnesium', label: 'magnesium', unit: 'mg', target: targets.magnesiumMg },
  ] as const)
    gaps.push({ ...g, have: dayHave(g.key), partialOk: true })
  // Vitamins and trace minerals: the two furthest below target (only counted once most of the day's food has
  // vitamin data, so missing data isn't mistaken for a gap). Only full fixes: a vitamin half-closed isn't worth a line.
  if (sex && vitaminCoverage(dayLogs.map((l) => l.nutrients)) >= 70)
    for (const st of microStatus(total, sex, targets.age).filter((x) => x.pct < 80).slice(0, 2))
      gaps.push({ goal: st.micro.key, key: st.micro.key, label: st.micro.label, unit: st.micro.unit, target: st.target, have: dayHave(st.micro.key), partialOk: true })

  for (const gap of gaps) {
    const need = gap.target - gap.have()
    // Ignore tiny gaps (under 3%).
    if (need <= gap.target * 0.03) continue
    // A food already in the plan (for this meal, or any meal for a daily gap) can only grow up to its limit.
    const planFor = (id: string) => plans.find((x) => x.u.food.id === id && (!gap.meal || !x.meal || x.meal === gap.meal))
    const room = usual
      .map((u) => {
        const p = planFor(u.food.id)
        if (!p) return u
        return u.maxSteps > p.steps ? { ...u, maxSteps: u.maxSteps - p.steps } : null
      })
      .filter((u): u is UsualFood => !!u)
    const pick = bestAddition(room, gap.key, need, gap.meal, (n) => {
      // Judge the food together with everything already planned (and any portion of it already planned).
      const others = plannedItems()
      return crossings([...others, n], n).length > 0
    })
    if (!pick || (pick.partial && !gap.partialOk)) continue
    const p = planFor(pick.u.food.id)
    if (p) {
      p.steps += pick.steps
      p.meal ??= gap.meal
      if (!p.goals.includes(gap)) p.goals.push(gap)
    } else {
      const already = !!gap.meal && withAminos.some((l) => l.meal === gap.meal && l.food_id === pick.u.food.id)
      plans.push({ u: usual.find((x) => x.food.id === pick.u.food.id)!, steps: pick.steps, meal: gap.meal, already, goals: [gap] })
    }
  }

  const fmt = fmtN
  const all = plannedItems()
  for (const [i, p] of plans.entries()) {
    const n = all[i]
    const over = crossings(all, n)
    // Everything this food helps: the gaps it was picked for, plus any other open gap it closes a real part of.
    const helps = gaps.filter((g) => {
      if (g.meal && g.meal !== p.meal) return false
      const gain = (n[g.key] as number) ?? 0
      const before = g.have() - gain
      return p.goals.includes(g) || (before < g.target * 0.97 && gain >= (g.target - before) * 0.15)
    })
    const parts = helps.map((g) => {
      const gain = (n[g.key] as number) ?? 0
      const after = g.have()
      return `+${fmt(gain)} ${g.unit} ${g.label} (${after >= g.target * 0.97 ? 'reaches' : 'gets you to'} ${fmt(after)} of ${fmt(g.target)} ${g.unit})`
    })
    const kcal = Math.round(n.kcal ?? 0)
    out.push({
      kind: 'add',
      goal: p.goals[0].goal,
      helps: [...new Set([...p.goals, ...helps].map((g) => g.goal))],
      text: p.meal
        ? `${add} ${amountText(p.u, p.steps)}${p.already ? ' more' : ''} ${p.u.food.name} ${p.already ? 'at' : 'to'} ${mealLabel(p.meal)}${would}`
        : `${add} ${amountText(p.u, p.steps)} ${p.u.food.name}${would}`,
      effect: `${parts.join(' · ')} · +${kcal} kcal`,
      warning: over.length ? `${past ? 'Would have put' : 'Puts'} you over ${over.map((c) => c.text).join(', ')}` : undefined,
    })
  }

  // 3. Over a limit: trim the biggest contributor, or swap it for something you eat at that meal.
  const limits: { key: keyof Nutrients; goal: string; name: string; limit: number | null; unit: string }[] = [
    { key: 'netCarbs', goal: 'netCarbs', name: 'net carbs', limit: targets.netCarbsG, unit: 'g' },
    { key: 'kcal', goal: 'calories', name: 'kcal', limit: targets.calories, unit: '' },
    { key: 'fat', goal: 'fat', name: 'fat', limit: fatBudget, unit: 'g' },
  ]
  for (const lim of limits) {
    if (lim.limit == null) continue
    const over = ((total[lim.key] as number) ?? 0) - lim.limit
    if (over <= lim.limit * 0.02) continue
    const biggest = [...dayLogs].sort((a, b) => (b.nutrients[lim.key] ?? 0) - (a.nutrients[lim.key] ?? 0))[0]
    const contrib = biggest.nutrients[lim.key] ?? 0
    if (contrib <= 0) continue
    const amt = (v: number) => (lim.unit ? `${round1(v)} g ${lim.name}` : `${Math.round(v)} kcal`)
    const keep = Math.floor(biggest.amount * (1 - over / contrib) * 2) / 2
    if (keep >= biggest.amount * 0.25 && keep < biggest.amount) {
      // Trimming covers it: how much of that item would keep you under (rounded down to a half portion).
      out.push({
        kind: 'trim',
        goal: lim.goal,
        text: `${past ? 'Having' : 'Have'} ${formatAmount(keep, biggest.unit)} of ${biggest.food_name} instead of ${formatAmount(biggest.amount, biggest.unit)}${would}`,
        effect: `About −${amt(over)}, back under your ${lim.unit ? `${lim.limit} g` : `${Math.round(lim.limit).toLocaleString()} kcal`} limit`,
      })
      continue
    }
    // Swap: a food you eat at the same meal with much less of this, similar protein.
    const meal = biggest.meal
    const old = biggest.nutrients
    const swap = usual
      .filter((u) => u.food.id !== biggest.food_id && u.meals.has(meal))
      .map((u) => ({ u, n: per(u, u.usualSteps) }))
      .filter((x) => (x.n[lim.key] ?? 0) < (old[lim.key] ?? 0) - over && (x.n.protein ?? 0) >= (old.protein ?? 0) * 0.6)
      .sort((a, b) => (a.n[lim.key] ?? 0) - (b.n[lim.key] ?? 0))[0]
    if (swap) {
      out.push({
        kind: 'swap',
        goal: lim.goal,
        text: `${past ? 'Swapping' : 'Swap'} ${biggest.food_name} for ${amountText(swap.u, swap.u.usualSteps)} ${swap.u.food.name} at ${mealLabel(meal)}${would}`,
        effect: `−${amt((old[lim.key] ?? 0) - (swap.n[lim.key] ?? 0))}, protein ${Math.round(old.protein ?? 0)} → ${Math.round(swap.n.protein ?? 0)} g`,
      })
    } else {
      out.push({
        kind: 'trim',
        goal: lim.goal,
        text: `${past ? 'Skipping' : 'Skip'} ${biggest.food_name}${would}`,
        effect: `It was ${amt(contrib)}; the day went ${amt(over)} over. Log a lower-${lim.unit ? lim.name : 'calorie'} food you like a few times and swaps will show up here.`,
      })
    }
  }
  return out
}
