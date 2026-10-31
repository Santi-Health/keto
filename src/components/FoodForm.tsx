import { useState } from 'react'
import { useData } from '../lib/data'
import { completeNutrients, type Food, type NewFood } from '../lib/foods'
import type { SugarAlcoholType } from '../lib/nutrition'
import type { NutrientKey, Nutrients } from '../lib/nutrients'
import type { UnitConversion } from '../lib/units'
import { MERCURY_PPM, detectFishSpecies, type FishSpecies } from '../lib/watchlist'
import { Sheet } from './Sheet'

interface Props {
  /** Existing or unsaved food to edit; omit to create one from a label. */
  food?: Food | NewFood
  barcode?: string
  onClose: () => void
  onSaved: (food: Food) => void
}

// Label order, so typing from a US nutrition facts panel goes top to bottom.
const FIELDS: { key: NutrientKey; label: string; unit: string; more?: boolean }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'fat', label: 'Total fat', unit: 'g' },
  { key: 'satFat', label: 'Saturated fat', unit: 'g' },
  { key: 'transFat', label: 'Trans fat', unit: 'g' },
  { key: 'cholesterolMg', label: 'Cholesterol', unit: 'mg' },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg' },
  { key: 'carbs', label: 'Total carbs', unit: 'g' },
  { key: 'fiber', label: 'Fiber', unit: 'g' },
  { key: 'sugars', label: 'Total sugars', unit: 'g' },
  { key: 'addedSugars', label: 'Added sugars', unit: 'g' },
  { key: 'sugarAlcohols', label: 'Sugar alcohols', unit: 'g' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'potassiumMg', label: 'Potassium', unit: 'mg' },
  { key: 'magnesiumMg', label: 'Magnesium', unit: 'mg', more: true },
  { key: 'calciumMg', label: 'Calcium', unit: 'mg', more: true },
  { key: 'ironMg', label: 'Iron', unit: 'mg', more: true },
  { key: 'vitDUg', label: 'Vitamin D', unit: 'µg', more: true },
  { key: 'vitCMg', label: 'Vitamin C', unit: 'mg', more: true },
  { key: 'vitAUg', label: 'Vitamin A', unit: 'µg', more: true },
  { key: 'b12Ug', label: 'Vitamin B12', unit: 'µg', more: true },
  { key: 'folateUg', label: 'Folate', unit: 'µg', more: true },
  { key: 'zincMg', label: 'Zinc', unit: 'mg', more: true },
  { key: 'omega3', label: 'Omega-3', unit: 'g', more: true },
  { key: 'omega6', label: 'Omega-6', unit: 'g', more: true },
  { key: 'caffeineMg', label: 'Caffeine', unit: 'mg', more: true },
  { key: 'alcohol', label: 'Alcohol', unit: 'g', more: true },
  { key: 'retinolUg', label: 'Vitamin A (retinol)', unit: 'µg', more: true },
]

const SUGAR_ALCOHOLS: { value: SugarAlcoholType; label: string }[] = [
  { value: 'erythritol', label: 'Erythritol (subtract all)' },
  { value: 'allulose', label: 'Allulose (subtract all)' },
  { value: 'xylitol', label: 'Xylitol (subtract half)' },
  { value: 'maltitol', label: 'Maltitol (subtract half)' },
  { value: 'sorbitol', label: 'Sorbitol (subtract half)' },
  { value: 'glycerin', label: 'Glycerin (subtract half)' },
  { value: 'other', label: 'Other / unknown (subtract half)' },
]

const round = (n: number) => Math.round(n * 100) / 100

export function FoodForm({ food, barcode, onClose, onSaved }: Props) {
  const { saveFood } = useData()
  const firstServing = food?.unit_conversions[0]
  // Edit per serving when the food has one (that's what labels show), otherwise per 100 g.
  const [servingG, setServingG] = useState(String(firstServing?.grams ?? 100))
  const [servingLabel, setServingLabel] = useState(firstServing?.unit ?? '1 serving')
  const factor = (Number(servingG) || 100) / 100
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    for (const f of FIELDS) {
      const x = food?.per_100g[f.key]
      if (x != null) v[f.key] = String(round(x * factor))
    }
    return v
  })
  const [name, setName] = useState(food?.name ?? '')
  const [brand, setBrand] = useState(food?.brand ?? '')
  const [code, setCode] = useState(food?.barcode ?? barcode ?? '')
  const [ingredients, setIngredients] = useState(food?.ingredients_text ?? '')
  const [euLabel, setEuLabel] = useState(food?.carbs_exclude_fiber ?? false)
  const [alcoholType, setAlcoholType] = useState<SugarAlcoholType>(food?.meta.sugarAlcoholType ?? 'erythritol')
  const [fish, setFish] = useState<FishSpecies | ''>(food?.meta.fishSpecies ?? '')
  const [sweeteners, setSweeteners] = useState((food?.meta.sweeteners ?? []).join(', '))
  const [ultra, setUltra] = useState(food?.meta.novaGroup === 4)
  const [heavyMetal, setHeavyMetal] = useState(food?.meta.heavyMetalRisk ?? false)
  const [extraUnits, setExtraUnits] = useState<UnitConversion[]>(food?.unit_conversions.slice(1) ?? [])
  const [showMore, setShowMore] = useState(FIELDS.some((f) => f.more && values[f.key]))
  const [error, setError] = useState<string | null>(null)

  function onNameBlur() {
    // Suggest watch-list flags from the name; the user can still change them.
    if (!fish) {
      const f = detectFishSpecies(`${name} ${brand}`)
      if (f) setFish(f)
    }
  }

  function save() {
    const grams = Number(servingG)
    if (!name.trim()) return setError('Give the food a name.')
    if (!(grams > 0)) return setError('Serving size must be more than 0 g.')
    const per100: Nutrients = {}
    for (const f of FIELDS) {
      const raw = values[f.key]
      if (raw != null && raw !== '' && Number.isFinite(Number(raw))) per100[f.key] = (Number(raw) * 100) / grams
    }
    if (per100.kcal == null && per100.carbs == null && per100.protein == null && per100.fat == null)
      return setError('Enter at least calories or the macros.')

    const units: UnitConversion[] = [
      ...(grams !== 100 || servingLabel !== '1 serving' ? [{ unit: servingLabel.trim() || '1 serving', grams }] : []),
      ...extraUnits.filter((u) => u.unit.trim() && u.grams > 0),
    ]
    const sweetenerList = sweeteners.split(',').map((s) => s.trim()).filter(Boolean)
    const base = {
      name: name.trim(),
      brand: brand.trim() || null,
      barcode: code.trim() || null,
      per_100g: completeNutrients(per100, euLabel, alcoholType),
      unit_conversions: units,
      ingredients_text: ingredients.trim() || null,
      keto_notes: food?.keto_notes ?? null,
      carbs_exclude_fiber: euLabel,
      source: food?.source ?? 'manual',
      confidence: food?.confidence ?? 'high',
      fields_estimated: food?.fields_estimated ?? [],
      meta: {
        ...food?.meta,
        fishSpecies: fish || null,
        sweeteners: sweetenerList,
        novaGroup: ultra ? 4 : food?.meta.novaGroup === 4 ? null : (food?.meta.novaGroup ?? null),
        heavyMetalRisk: heavyMetal,
        sugarAlcoholType: alcoholType,
      },
    } satisfies NewFood
    // saveFood returns an existing match for a new food (same barcode/source), so apply the edits on top of it.
    const saved = food && 'id' in food ? saveFood({ ...food, ...base }) : saveFood({ ...saveFood(base), ...base })
    onSaved(saved)
  }

  const setValue = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }))

  return (
    <Sheet
      title={food && 'id' in food ? 'Edit food' : food?.source === 'label_photo' || food?.source === 'ai_estimate' ? 'Review food' : 'New food'}
      subtitle={
        food && !('id' in food) && (food.source === 'label_photo' || food.source === 'ai_estimate')
          ? 'From Claude: check the values against the label, then save'
          : 'Type values from the nutrition label'
      }
      onClose={onClose}
    >
      {food && !('id' in food) && (food.keto_notes || food.fields_estimated.length > 0 || food.confidence === 'low') && (
        <div className="notice small">
          {food.keto_notes && <div>{food.keto_notes}</div>}
          {food.fields_estimated.length > 0 && (
            <div>
              Estimated, not on the label: {food.fields_estimated.map((k) => FIELDS.find((f) => f.key === k)?.label.toLowerCase() ?? k).join(', ')}.
            </div>
          )}
          {food.confidence === 'low' && <div>Low confidence: the label couldn't be read well.</div>}
        </div>
      )}
      <div className="field">
        <label htmlFor="ff-name">Name</label>
        <input id="ff-name" type="text" value={name} onChange={(e) => setName(e.target.value)} onBlur={onNameBlur} />
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="ff-brand">Brand</label>
          <input id="ff-brand" type="text" value={brand} onChange={(e) => setBrand(e.target.value)} onBlur={onNameBlur} />
        </div>
        <div className="field">
          <label htmlFor="ff-code">Barcode</label>
          <input id="ff-code" type="text" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
      </div>

      <div className="section-label">Serving</div>
      <div className="row">
        <div className="field">
          <label htmlFor="ff-sl">Serving name</label>
          <input id="ff-sl" type="text" value={servingLabel} onChange={(e) => setServingLabel(e.target.value)} placeholder="1 bar, 2 tbsp…" />
        </div>
        <div className="field">
          <label htmlFor="ff-sg">Serving weight</label>
          <div className="row">
            <input id="ff-sg" type="number" inputMode="decimal" value={servingG} onChange={(e) => setServingG(e.target.value)} />
            <span className="muted small" style={{ flex: '0 0 auto' }}>g</span>
          </div>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: -6 }}>Enter the amounts below for one serving, as printed on the label.</p>

      <div className="section-label">Nutrition per serving</div>
      <div className="form-grid">
        {FIELDS.filter((f) => !f.more || showMore).map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`ff-${f.key}`}>
              {f.label} <span className="muted">({f.unit})</span>
            </label>
            <input
              id={`ff-${f.key}`}
              type="number"
              inputMode="decimal"
              step="any"
              value={values[f.key] ?? ''}
              onChange={(e) => setValue(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>
      {!showMore && (
        <button type="button" className="link" style={{ margin: '0 0 12px' }} onClick={() => setShowMore(true)}>
          More nutrients (magnesium, omega-3/6, caffeine…)
        </button>
      )}
      {values.sugarAlcohols && Number(values.sugarAlcohols) > 0 && (
        <div className="field">
          <label htmlFor="ff-sa">Sugar alcohol type</label>
          <select id="ff-sa" value={alcoholType} onChange={(e) => setAlcoholType(e.target.value as SugarAlcoholType)}>
            {SUGAR_ALCOHOLS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={euLabel} onChange={(e) => setEuLabel(e.target.checked)} />
        Label carbs already exclude fiber (EU/UK labels)
      </label>

      <div className="section-label">Watch list</div>
      <div className="field">
        <label htmlFor="ff-fish">Fish or seafood (for mercury)</label>
        <select id="ff-fish" value={fish} onChange={(e) => setFish(e.target.value as FishSpecies | '')}>
          <option value="">Not fish</option>
          {Object.entries(MERCURY_PPM).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <label className="check">
        <input type="checkbox" checked={ultra} onChange={(e) => setUltra(e.target.checked)} />
        Ultra-processed
      </label>
      <label className="check">
        <input type="checkbox" checked={heavyMetal} onChange={(e) => setHeavyMetal(e.target.checked)} />
        Lead/cadmium risk type (dark chocolate, cacao, protein powder)
      </label>
      <div className="field">
        <label htmlFor="ff-sw">Artificial sweeteners</label>
        <input id="ff-sw" type="text" value={sweeteners} onChange={(e) => setSweeteners(e.target.value)} placeholder="e.g. sucralose, aspartame" />
      </div>
      <div className="field">
        <label htmlFor="ff-ing">Ingredients (optional)</label>
        <textarea id="ff-ing" value={ingredients} onChange={(e) => setIngredients(e.target.value)} />
      </div>

      <div className="section-label">Other portions</div>
      {extraUnits.map((u, i) => (
        <div className="row" key={i} style={{ marginBottom: 8 }}>
          <input
            type="text"
            aria-label="Portion name"
            value={u.unit}
            placeholder="1 slice"
            onChange={(e) => setExtraUnits(extraUnits.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}
          />
          <input
            type="number"
            aria-label="Portion grams"
            inputMode="decimal"
            value={u.grams || ''}
            placeholder="grams"
            onChange={(e) => setExtraUnits(extraUnits.map((x, j) => (j === i ? { ...x, grams: Number(e.target.value) } : x)))}
          />
          <button type="button" className="icon-btn" aria-label="Remove portion" onClick={() => setExtraUnits(extraUnits.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn secondary" onClick={() => setExtraUnits([...extraUnits, { unit: '', grams: 0 }])}>
        + Add a portion (e.g. 1 slice = 28 g)
      </button>

      {error && <p className="notice" role="alert">{error}</p>}
      <div className="row" style={{ marginTop: 16 }}>
        <button type="button" className="btn" onClick={save}>
          Save food
        </button>
      </div>
    </Sheet>
  )
}
