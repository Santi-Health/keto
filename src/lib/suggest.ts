import { LEUCINE_PER_MEAL_G, estimateAminos, type MuscleGoal } from './aminoAcids'
import { MEALS, portionNutrients, type Food, type LogEntry, type Meal } from './foods'
import { addNutrients, type Nutrients } from './nutrients'
import { microStatus, vitaminCoverage } from './micros'
import type { Targets } from './targets'
import type { Sex } from './types'
import { formatAmount, toGrams } from './units'

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
  /** Your usual portion in grams; seasonings (a pinch of salt or pepper) are never suggested. */
  usualGrams: number
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
}

const isRestaurant = (f: Food) => f.fields_estimated.includes('restaurant portions')
const isDrink = (f: Food) => !!f.meta.externalId?.startsWith('drink:') && !f.meta.externalId.startsWith('drink:milk')
const round1 = (n: number) => Math.round(n * 10) / 10

/** Units you count rather than weigh ("1 egg", "slice", "pod"); weighed units step by half an ounce. */
const WEIGHED = new Set(['g', 'oz', 'ml', 'fl oz', 'cup', 'tbsp', 'tsp'])
/** Below this, a food is a seasoning (a pinch of salt or pepper), not something to eat more of. */
const SEASONING_G = 5

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
  // Up to one more of your usual portion: 2 eggs → up to 2 more, 6 oz → up to 6 oz more.
  return { food, unit, step, stepGrams, usualSteps, maxSteps: usualSteps, usualGrams: usualSteps * stepGrams, meals, timesLogged }
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
 * `need` of a nutrient, within one more of your usual portion and about 200 kcal (never seasonings). Prefers foods
 * you eat at `meal`. When nothing covers all of it, the best one that covers at least half (`partial`).
 */
function bestAddition(usual: UsualFood[], key: keyof Nutrients, need: number, meal?: Meal) {
  type Pick = { u: UsualFood; steps: number; gain: number; kcal: number; carbs: number; score: number; partial: boolean }
  let best: Pick | null = null
  let bestPartial: Pick | null = null
  for (const u of usual) {
    if (u.usualGrams < SEASONING_G) continue
    const one = per(u, 1)[key] ?? 0
    if (one <= 0) continue
    const full = Math.ceil(need / one - 1e-9)
    const steps = Math.min(full, u.maxSteps)
    const n = per(u, steps)
    const kcal = n.kcal ?? 0
    if (kcal > MAX_ADD_KCAL && full > 1) continue
    const carbs = n.netCarbs ?? 0
    const gain = n[key] ?? 0
    // Calories first, net carbs weigh 20× (a keto budget), a small bonus for foods you eat at this meal.
    const score = kcal + carbs * 20 - (meal && u.meals.has(meal) ? 15 : 0) - Math.min(u.timesLogged, 10)
    if (steps === full) {
      if (!best || score < best.score) best = { u, steps, gain, kcal, carbs, score, partial: false }
    } else if (gain >= need * 0.5) {
      // Partial: rank by how much of the gap it closes per calorie.
      const pscore = score / (gain / need)
      if (!bestPartial || pscore < bestPartial.score) bestPartial = { u, steps, gain, kcal, carbs, score: pscore, partial: true }
    }
  }
  return best ?? bestPartial
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
}

export function suggestFixes({ dayLogs, history, foods, targets, muscleGoal, fatBudget, past, sex }: SuggestInput): Suggestion[] {
  if (!dayLogs.length) return []
  const usual = usualFoods(foods, history)
  if (!usual.length) return []
  const out: Suggestion[] = []
  const add = past ? 'Adding' : 'Add'
  const would = past ? ' would have done it' : ''
  const withAminos = dayLogs.map((l) => ({ ...l, nutrients: estimateAminos(l.nutrients) }))
  const total = addNutrients(withAminos.map((l) => l.nutrients))

  // 1. Leucine, meal by meal.
  const leuTarget = LEUCINE_PER_MEAL_G[muscleGoal]
  for (const m of MEALS) {
    const items = withAminos.filter((l) => l.meal === m.value)
    if (!items.length) continue
    const leu = items.reduce((s, l) => s + (l.nutrients.leuG ?? 0), 0)
    if (leu >= leuTarget) continue
    const b = bestAddition(usual, 'leuG', leuTarget - leu, m.value)
    if (!b) continue
    const already = items.some((l) => l.food_id === b.u.food.id)
    out.push({
      kind: 'add',
      goal: 'leucine',
      text: `${add} ${already ? `${amountText(b.u, b.steps)} more ` : `${amountText(b.u, b.steps)} `}${b.u.food.name} ${already ? 'at' : 'to'} ${mealLabel(m.value)}${would}`,
      effect: `+${b.gain.toFixed(1)} g leucine (${(leu + b.gain).toFixed(1)} of ${leuTarget} g) · +${Math.round(b.kcal)} kcal`,
    })
  }

  // 2. Daily nutrients that ran short.
  const kcalRoom = targets.calories != null ? targets.calories - total.kcal : Infinity
  const shortfalls: { key: keyof Nutrients; goal: string; name: string; unit: string; target: number }[] = [
    { key: 'protein', goal: 'protein', name: 'protein', unit: 'g', target: targets.proteinG },
    { key: 'fiber', goal: 'fiber', name: 'fiber', unit: 'g', target: targets.fiberG },
    { key: 'potassiumMg', goal: 'potassium', name: 'potassium', unit: 'mg', target: targets.potassiumMg },
    { key: 'magnesiumMg', goal: 'magnesium', name: 'magnesium', unit: 'mg', target: targets.magnesiumMg },
  ]
  for (const s of shortfalls) {
    const have = (total[s.key] as number) ?? 0
    const need = s.target - have
    // Ignore tiny gaps (under 3%) and big ones a single addition can't sensibly close.
    if (need <= s.target * 0.03) continue
    const b = bestAddition(usual, s.key, need)
    if (!b) continue
    const fmt = (v: number) => (s.unit === 'mg' ? Math.round(v).toLocaleString() : v.toFixed(1))
    out.push({
      kind: 'add',
      goal: s.goal,
      text: `${add} ${amountText(b.u, b.steps)} ${b.u.food.name}${would}`,
      effect: `+${fmt(b.gain)} ${s.unit} ${s.name} (${b.partial ? 'gets you to' : 'reaches'} ${fmt(have + b.gain)} of ${fmt(s.target)}) · +${Math.round(b.kcal)} kcal${b.kcal > kcalRoom ? ' (over your calorie target)' : ''}`,
    })
  }

  // 2b. Vitamins and trace minerals: the two furthest below target that one usual food can close
  // (only counted once most of the day's food has vitamin data, so missing data isn't mistaken for a gap).
  if (sex && vitaminCoverage(dayLogs.map((l) => l.nutrients)) >= 70) {
    let added = 0
    for (const st of microStatus(total, sex, targets.age)) {
      if (added >= 2 || st.pct >= 80) break
      const b = bestAddition(usual, st.micro.key, st.target - st.value)
      if (!b) continue
      const fmt = (v: number) => (v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? v.toFixed(0) : v.toFixed(1))
      out.push({
        kind: 'add',
        goal: st.micro.key,
        text: `${add} ${amountText(b.u, b.steps)} ${b.u.food.name}${would}`,
        effect: `+${fmt(b.gain)} ${st.micro.unit} ${st.micro.label} (${b.partial ? 'gets you to' : 'reaches'} ${fmt(st.value + b.gain)} of ${fmt(st.target)}) · +${Math.round(b.kcal)} kcal`,
      })
      added++
    }
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
