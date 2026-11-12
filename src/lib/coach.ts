import type { DayEnergy } from './deficit'
import type { FoodImpact, OddThing } from './glucoseInsights'
import type { KetoEstimate } from './ketosis'
import type { Readiness } from './readiness'
import type { BodyScan } from './readings'
import type { Suggestion } from './suggest'
import type { GroupWeek, LiftPlan } from './training'
import type { WatchItem } from './watchlist'

/** Your goals, highest priority first. When a tip helps one and costs another, the higher one wins. */
export const GOALS = [
  { id: 'muscle', label: 'Keep or build muscle' },
  { id: 'fat', label: 'Lose fat to 12%' },
  { id: 'abs', label: 'Visible abs and chest' },
  { id: 'keto', label: 'Stay in ketosis' },
  { id: 'sugar', label: 'Steady blood sugar' },
  { id: 'vo2', label: 'Raise VO2 max' },
  { id: 'strength', label: 'Keep strength' },
  // Not one of your goals, but the watch list (mercury, trans fat…) needs somewhere to point.
  { id: 'health', label: 'General health' },
] as const

export type GoalId = (typeof GOALS)[number]['id']
export const goalRank = (g: GoalId) => GOALS.findIndex((x) => x.id === g)
export const goalLabel = (g: GoalId) => GOALS.find((x) => x.id === g)!.label

export type CoachSection = 'nutrition' | 'sugar' | 'training' | 'abs'

export interface CoachTip {
  id: string
  section: CoachSection
  /** The goal this tip is for. */
  goal: GoalId
  /** 'warn' needs attention, 'do' is a next step, 'good' says you're on track. */
  tone: 'warn' | 'do' | 'good'
  title: string
  detail?: string
  /** What this costs another goal, and the choice that serves both. */
  tradeoff?: string
}

export const BODY_FAT_GOAL = 12
export const DEFICIT_GOAL = 500
/** Lifting days a week that keep muscle in a deficit. */
export const LIFT_DAYS_GOAL = 3
/** Above this share of your burn, a deficit starts costing muscle. */
export const MAX_DEFICIT_SHARE = 0.25
const KCAL_PER_LB_FAT = 3500
const KG_PER_LB = 0.45359237

export interface CoachInput {
  today: string
  /** Food tips for today from the suggestion engine. */
  suggestions: Suggestion[]
  proteinTargetG: number
  proteinTodayG: number
  netCarbLimitG: number
  /** Today's target is already a muscle-risky deficit. */
  muscleWarning: string | null
  /** The last 7 full days of burned vs. eaten. */
  week: DayEnergy[]
  /** Watch-list items over or near their limit (sugar, saturated fat…). */
  watch: WatchItem[]
  ketoNow: KetoEstimate
  ketoTomorrow: KetoEstimate
  readiness: Readiness | null
  coverage: GroupWeek[]
  due: GroupWeek[]
  plans: LiftPlan[]
  daysSinceStrength: number | null
  liftStreak: number
  /** Hard cardio sessions in the last 7 days, including today. */
  hardCardio: number
  /** What's already logged today, so advice is for today or tomorrow. */
  doneToday: { strength: boolean; hardCardio: boolean; any: boolean }
  /** Days with strength training in the last 7, including today. */
  liftDays: number
  /** Calories eaten so far today. */
  eatenTodayKcal: number
  odd: OddThing[]
  spikeFoods: FoodImpact[]
  /** Days with CGM data in the last 7. */
  cgmDays: number
  scans: { date: string; scan: BodyScan }[]
}

const GROUP_GOAL: Record<string, GoalId> = { Chest: 'abs', 'Abs / core': 'abs' }
const SUGGEST_GOAL: Record<string, GoalId> = {
  leucine: 'muscle',
  protein: 'muscle',
  netCarbs: 'keto',
  calories: 'fat',
  fat: 'fat',
  fiber: 'sugar',
  potassium: 'keto',
  magnesium: 'keto',
  sodium: 'keto',
}
const WATCH_GOAL: Partial<Record<WatchItem['key'], GoalId>> = { addedSugars: 'sugar', alcohol: 'fat', sweeteners: 'sugar' }
const SUGGEST_WHY: Record<string, string> = {
  fiber: 'Fiber slows how fast a meal reaches your blood.',
  potassium: 'Keto flushes electrolytes; low potassium shows up as cramps and fatigue.',
  magnesium: 'Keto flushes electrolytes; magnesium helps sleep and cramps.',
  sodium: 'Keto flushes sodium; too little brings headaches and low energy.',
}

const fmt = (n: number) => Math.round(n).toLocaleString()

/** Everything the coach has to say, grouped by section, each tied to a goal. */
export function buildCoach(c: CoachInput): CoachTip[] {
  return dedupe([...food(c), ...keto(c), ...sugar(c), ...training(c), ...abs(c)])
}

/**
 * One tip per point: the weekly deficit (last 7 full days, not today) covers today's calorie suggestions and the steep-target warning,
 * and being out of ketosis covers the carb suggestion.
 */
function dedupe(tips: CoachTip[]): CoachTip[] {
  const has = (id: string) => tips.some((t) => t.id === id)
  const pace = has('deficit-high') || has('deficit-low') || has('deficit-ok')
  return tips.filter((t) => {
    // With 3+ logged days the weekly pace decides; today's target alone only speaks when there's no week to judge.
    if (t.id === 'muscle-warning' && pace) return false
    if (t.id.startsWith('suggest-') && pace && (t.goal === 'fat')) return false
    if (t.id.startsWith('suggest-') && has('keto-out') && t.goal === 'keto' && /carb/i.test(t.title)) return false
    return true
  })
}

/** The few tips that matter most right now: warnings first, then by goal priority. */
export function topTips(tips: CoachTip[], n = 3): CoachTip[] {
  const tone = { warn: 0, do: 1, good: 2 }
  return tips
    .filter((t) => t.tone !== 'good')
    .sort((a, b) => tone[a.tone] - tone[b.tone] || goalRank(a.goal) - goalRank(b.goal))
    .slice(0, n)
}

/** Average daily deficit and burn over the logged days of the week. */
export function weekPace(week: DayEnergy[]) {
  const days = week.filter((d) => d.logged)
  if (!days.length) return null
  const deficit = days.reduce((s, d) => s + d.deficit, 0) / days.length
  const burn = days.reduce((s, d) => s + d.burned, 0) / days.length
  return { days: days.length, deficit, burn, lbPerWeek: (deficit * 7) / KCAL_PER_LB_FAT }
}

/** Where today stands against the intake that would make a ~500 deficit, so the weekly tip has a today action. */
function todayLine(c: CoachInput, aim: number): string {
  if (c.eatenTodayKcal <= 0) return ' Nothing logged today yet.'
  const left = aim - c.eatenTodayKcal
  return ` Today so far: ${fmt(c.eatenTodayKcal)} kcal eaten; about ${fmt(aim)} for the day lands near a ${DEFICIT_GOAL} deficit${left > 0 ? `, so ${fmt(left)} more` : ', already there'}.`
}

function food(c: CoachInput): CoachTip[] {
  const out: CoachTip[] = []
  const pace = weekPace(c.week)
  if (pace && pace.days >= 3) {
    const cap = pace.burn * MAX_DEFICIT_SHARE
    const pctBurn = Math.round((pace.deficit / pace.burn) * 100)
    if (pace.deficit > Math.max(cap, 750)) {
      out.push({
        id: 'deficit-high',
        section: 'nutrition',
        goal: 'muscle',
        tone: 'warn',
        title: `Eat about ${fmt(pace.deficit - DEFICIT_GOAL)} kcal more a day`,
        detail: `Your deficit averaged ${fmt(pace.deficit)} kcal a day over the last ${pace.days} days (${pctBurn}% of your burn).${todayLine(c, pace.burn - DEFICIT_GOAL)}`,
        tradeoff: `A bigger deficit burns fat faster (Lose fat), but past about ${Math.round(MAX_DEFICIT_SHARE * 100)}% of your burn you start losing muscle, which is your top goal. Around ${DEFICIT_GOAL} a day serves both: add the calories as fat, keep protein where it is.`,
      })
    } else if (pace.deficit < 250) {
      out.push({
        id: 'deficit-low',
        section: 'nutrition',
        goal: 'fat',
        tone: 'do',
        title: `Trim about ${fmt(DEFICIT_GOAL - pace.deficit)} kcal a day`,
        detail: `Your deficit averaged ${fmt(pace.deficit)} kcal a day over the last ${pace.days} days, about ${pace.lbPerWeek.toFixed(1)} lb of fat a week.${todayLine(c, pace.burn - DEFICIT_GOAL)}`,
        tradeoff: 'Cut from fat (oils, butter, cheese), not protein: cutting protein would cost muscle, your top goal.',
      })
    } else {
      out.push({
        id: 'deficit-ok',
        section: 'nutrition',
        goal: 'fat',
        tone: 'good',
        title: `Deficit on pace: ${fmt(pace.deficit)} kcal a day`,
        detail: `About ${pace.lbPerWeek.toFixed(1)} lb of fat a week over the last ${pace.days} days, without risking muscle.`,
      })
    }
  }
  if (c.muscleWarning) out.push({ id: 'muscle-warning', section: 'nutrition', goal: 'muscle', tone: 'warn', title: 'Today’s target is a steep deficit', detail: c.muscleWarning })

  const proteinLeft = c.proteinTargetG - c.proteinTodayG
  const hasProteinTip = c.suggestions.some((s) => s.goal === 'protein' || s.goal === 'leucine')
  if (proteinLeft > 5 && !hasProteinTip) {
    out.push({ id: 'protein-left', section: 'nutrition', goal: 'muscle', tone: 'do', title: `${fmt(proteinLeft)} g protein to go today`, detail: `Target ${c.proteinTargetG} g. Protein is what keeps muscle while you're in a deficit.` })
  }
  c.suggestions.forEach((s, i) => {
    const goal = SUGGEST_GOAL[s.goal] ?? 'fat'
    out.push({
      id: `suggest-${i}`,
      section: 'nutrition',
      goal,
      tone: 'do',
      title: s.text,
      detail: [s.effect, SUGGEST_WHY[s.goal]].filter(Boolean).join(' · '),
      tradeoff: s.warning,
    })
  })
  for (const w of c.watch.filter((x) => x.status === 'over')) {
    out.push({ id: `watch-${w.key}`, section: 'nutrition', goal: WATCH_GOAL[w.key] ?? 'health', tone: 'warn', title: `${w.label} over your limit`, detail: w.guidance })
  }
  return out
}

function keto(c: CoachInput): CoachTip[] {
  const out: CoachTip[] = []
  const k = c.ketoNow
  const reasons = k.reasons.length ? ` ${k.reasons.join(' ')}` : ''
  if (k.status === 'out' || k.status === 'light') {
    out.push({
      id: 'keto-out',
      section: 'nutrition',
      goal: 'keto',
      tone: 'warn',
      title: `Get back under ${c.netCarbLimitG} g net carbs a day`,
      detail: `Estimated ${k.mid.toFixed(1)} mmol/L now (${k.status === 'out' ? 'likely out of ketosis' : 'borderline'}). Usually 1–3 days to return.${reasons || ` ${fmt(k.carbs24h)} g net carbs in the last 24 h.`}`,
      tradeoff: 'Don’t cut protein to get back in: muscle ranks above ketosis. Cut carbs, and a fasted walk or workout speeds it up.',
    })
  } else {
    out.push({ id: 'keto-in', section: 'nutrition', goal: 'keto', tone: 'good', title: `In ketosis: about ${k.mid.toFixed(1)} mmol/L`, detail: reasons.trim() || `${fmt(k.carbs24h)} g net carbs in the last 24 h.` })
  }
  if (c.ketoTomorrow.status !== k.status) {
    out.push({
      id: 'keto-tomorrow',
      section: 'nutrition',
      goal: 'keto',
      tone: c.ketoTomorrow.mid < k.mid ? 'do' : 'good',
      title: `Tomorrow 7 AM: about ${c.ketoTomorrow.mid.toFixed(1)} mmol/L`,
      detail: c.ketoTomorrow.mid < k.mid ? 'Heading down: keep tonight’s carbs low.' : 'Heading up if you keep eating like today.',
    })
  }
  if (c.proteinTodayG > c.proteinTargetG * 1.3) {
    out.push({
      id: 'protein-keto',
      section: 'nutrition',
      goal: 'muscle',
      tone: 'good',
      title: 'Protein is well above target',
      tradeoff: 'Lots of protein can lower ketones a little. Muscle ranks above ketosis, so it’s fine; if ketones drop, trim carbs, not protein.',
    })
  }
  return out
}

function sugar(c: CoachInput): CoachTip[] {
  const out: CoachTip[] = []
  if (c.cgmDays === 0) {
    out.push({ id: 'cgm-none', section: 'sugar', goal: 'sugar', tone: 'do', title: 'No glucose data this week', detail: 'Tap 🩸 Import glucose on Today to pull your Lingo readings.' })
  }
  c.odd.forEach((o, i) =>
    out.push({ id: `odd-${i}`, section: 'sugar', goal: 'sugar', tone: o.kind === 'low' || o.kind === 'low_carb_spike' ? 'warn' : 'do', title: o.title, detail: o.detail }),
  )
  return out
}

function training(c: CoachInput): CoachTip[] {
  const out: CoachTip[] = []
  const r = c.readiness
  if (r?.illness) {
    out.push({ id: 'ill', section: 'training', goal: 'muscle', tone: 'warn', title: 'Rest today: signs you may be getting sick', detail: `Readiness ${r.score}: ${r.illness.signs.join(', ')} off your normal. Training sick slows recovery and costs more muscle than a missed day.` })
  } else if (r?.band === 'low') {
    out.push({ id: 'low-ready', section: 'training', goal: 'muscle', tone: 'warn', title: 'Go easy today: yoga, a walk or light core', detail: `Readiness ${r.score}. Muscle grows while it recovers; a hard session now costs more than it builds.` })
  }
  const d = c.daysSinceStrength
  if (d == null || d >= 5) {
    out.push({
      id: 'lift-gap',
      section: 'training',
      goal: 'muscle',
      tone: d != null && d >= 8 ? 'warn' : 'do',
      title: d == null ? 'Start strength training' : `${d} days since you lifted`,
      detail: 'In a deficit, lifting is the signal that tells your body to keep muscle. Aim for 3 or more sessions a week.',
    })
  }
  if (c.liftStreak >= 3) {
    out.push({ id: 'streak', section: 'training', goal: 'muscle', tone: 'do', title: `${c.liftStreak} lifting days in a row: take a rest or yoga day`, detail: 'Recovery is when muscle is rebuilt, more so in a deficit.' })
  }
  // The week decides whether a session is needed; today decides when: today if nothing's done yet, tomorrow if you already lifted.
  const behind = c.liftDays < LIFT_DAYS_GOAL || c.due.length > 0
  const when = c.doneToday.strength ? 'Tomorrow' : 'Today'
  if (!r?.illness && r?.band !== 'low') {
    const top = c.due.slice(0, 3)
    const week = `${c.liftDays} lifting day${c.liftDays === 1 ? '' : 's'} in the last 7 (aim for ${LIFT_DAYS_GOAL}+).`
    if (top.length && behind) {
      out.push({
        id: 'next-session',
        section: 'training',
        goal: top.some((g) => GROUP_GOAL[g.group]) ? 'abs' : 'muscle',
        tone: 'do',
        title: `${when}: lift ${top.map((g) => g.group.toLowerCase()).join(', ')}`,
        detail:
          (c.doneToday.strength ? 'You lifted today, so this is for your next session. ' : '') +
          `${week} ` +
          top.map((g) => `${g.group} ${g.sets} of ${g.target} sets${g.daysSince != null ? `, last ${g.daysSince === 0 ? 'today' : g.daysSince === 1 ? 'yesterday' : `${g.daysSince} days ago`}` : ', not in 3 weeks'}`).join(' · '),
      })
    } else if (c.liftDays < LIFT_DAYS_GOAL && !c.doneToday.strength) {
      out.push({ id: 'next-session', section: 'training', goal: 'muscle', tone: 'do', title: 'Today: a full-body lift', detail: `${week} Every group was hit recently, so keep it moderate and add a rep or two to each lift.` })
    } else if (c.doneToday.strength && !behind) {
      out.push({ id: 'week-on-track', section: 'training', goal: 'muscle', tone: 'good', title: 'Lifted today and the week is on track', detail: `${week} No extra session needed; tomorrow can be yoga, a walk or intervals.` })
    } else if (c.coverage.every((g) => g.sets >= g.target)) {
      out.push({ id: 'week-done', section: 'training', goal: 'muscle', tone: 'good', title: 'Every muscle group hit its sets this week', detail: 'Extra sessions now add fatigue more than muscle; yoga, walks or intervals fit better.' })
    }
  }
  for (const p of c.plans.filter((x) => x.stalled)) {
    out.push({
      id: `stall-${p.name}`,
      section: 'training',
      goal: 'strength',
      tone: 'do',
      title: `${p.name}: same numbers 3 sessions in a row`,
      detail: 'Holding strength in a deficit is a win for muscle. To move again: sleep 7.5 h+, hit protein, or try 1–2 more reps before adding weight.',
      tradeoff: 'If it keeps stalling, your deficit may be too big for your training: eating closer to maintenance on lifting days helps strength without stopping fat loss.',
    })
  }
  if (c.hardCardio === 0 && !r?.illness && r?.band !== 'low') {
    out.push({
      id: 'vo2',
      section: 'training',
      goal: 'vo2',
      tone: 'do',
      // A lifting day already used today's hard effort; nothing yet today means today works.
      title: c.doneToday.strength ? 'Tomorrow or later this week: one interval session' : c.doneToday.any ? 'Add one interval session this week' : 'Today or this week: one interval session',
      detail: 'For example 4 × 4 minutes hard on the StairMaster or treadmill with 3 easy minutes between. Logged as Hard cardio.',
      tradeoff: 'Keep it to 1–2 a week while in a deficit, after lifting or on a non-lifting day: more hard cardio adds fatigue that competes with keeping muscle.',
    })
  }
  return out
}

function abs(c: CoachInput): CoachTip[] {
  const out: CoachTip[] = []
  const core = c.coverage.find((g) => g.group === 'Abs / core')
  const chest = c.coverage.find((g) => g.group === 'Chest')
  for (const g of [core, chest]) {
    if (!g) continue
    const name = g.group === 'Chest' ? 'chest' : 'core'
    out.push(
      g.sets >= g.target
        ? { id: `abs-${name}`, section: 'abs', goal: 'abs', tone: 'good', title: `${g.sets} ${name} sets this week`, detail: `At or above the ${g.target} that builds definition.` }
        : {
            id: `abs-${name}`,
            section: 'abs',
            goal: 'abs',
            tone: g.sets === 0 ? 'warn' : 'do',
            title: `${g.target - g.sets} more ${name} sets this week`,
            detail: `${g.sets} of ${g.target} so far.${name === 'core' ? ' Mix weighted crunches or cable crunches (6–15 reps) with hanging knee raises and rotation.' : ' Presses build the shape; keep them heavy (6–10 reps).'}`,
          },
    )
  }
  const latest = c.scans[c.scans.length - 1]
  const bf = latest?.scan.bodyFatPct
  if (latest && bf != null) {
    const totalLb = latest.scan.totalMassKg != null ? latest.scan.totalMassKg / KG_PER_LB : null
    const leanLb = latest.scan.leanMassKg != null && latest.scan.boneMassKg != null ? (latest.scan.leanMassKg + latest.scan.boneMassKg) / KG_PER_LB : null
    const toLose = totalLb != null && leanLb != null ? Math.max(0, totalLb - leanLb / (1 - BODY_FAT_GOAL / 100)) : null
    const pace = weekPace(c.week)
    const weeks = toLose != null && pace && pace.lbPerWeek > 0.1 ? Math.ceil(toLose / pace.lbPerWeek) : null
    if (bf > BODY_FAT_GOAL) {
      out.push({
        id: 'bodyfat',
        section: 'abs',
        goal: 'fat',
        tone: 'do',
        title: `Abs show at about ${BODY_FAT_GOAL}%: you were ${bf.toFixed(1)}% on ${new Date(`${latest.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        detail: `${toLose != null ? `About ${toLose.toFixed(1)} lb of fat to lose` : 'Fat loss needed'}${weeks ? `, roughly ${weeks} weeks at your current pace` : ''}. Ab training builds the muscle; body fat decides whether it shows.`,
        tradeoff: 'Don’t speed it up by cutting protein or lifting less: that costs muscle (top goal) and makes abs flatter, not sharper.',
      })
    }
    const age = Math.round((Date.parse(`${c.today}T12:00:00`) - Date.parse(`${latest.date}T12:00:00`)) / 86_400_000)
    if (age >= 35) {
      out.push({ id: 'rescan', section: 'abs', goal: 'muscle', tone: 'do', title: 'Time for a DEXA retest', detail: `Last scan was ${age} days ago. Retest under the same conditions (morning, fasted) to see whether lean mass held while fat dropped.` })
    }
  }
  return out
}
