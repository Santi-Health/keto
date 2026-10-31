import { useEffect, useId, useState, type ReactNode } from 'react'

interface NumberFieldProps {
  label: string
  value: number | null
  onChange: (value: number) => void
  suffix?: string
  hint?: ReactNode
  step?: number
  min?: number
  max?: number
}

/** Keeps the typed text locally so partial input like "1." isn't overwritten. */
export function NumberField({ label, value, onChange, suffix, hint, step = 1, min, max }: NumberFieldProps) {
  const id = useId()
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => {
    if (value == null) return
    setText((t) => (Number(t) === value ? t : String(value)))
  }, [value])

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="row">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={text}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            setText(e.target.value)
            const n = Number(e.target.value)
            if (e.target.value !== '' && Number.isFinite(n)) onChange(n)
          }}
        />
        {suffix && <span className="muted small" style={{ flex: '0 0 auto' }}>{suffix}</span>}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
