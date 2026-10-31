import { useEffect, type ReactNode } from 'react'

interface Props {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
}

/** Bottom sheet on phones, centered dialog when unfolded. Closes on backdrop tap or Escape. */
export function Sheet({ title, subtitle, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <h2>{title}</h2>
            {subtitle && <div className="muted small">{subtitle}</div>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
