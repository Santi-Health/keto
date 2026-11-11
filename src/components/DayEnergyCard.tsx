import type { DayEnergy } from '../lib/deficit'

interface Props {
  /** One entry per day shown: yesterday alone, or the 7 days. */
  days: DayEnergy[]
  /** Week view: totals instead of daily averages. */
  totals: boolean
  /** The daily deficit you aim for, in kcal. */
  goal: number | null
}

const fmt = (n: number) => Math.round(Math.abs(n)).toLocaleString()
const weekday = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })

/** Calories burned and eaten for a finished day or week, with the deficit (or surplus) on top. */
export function DayEnergyCard({ days, totals, goal }: Props) {
  const isWeek = days.length > 1
  // Days without food logged would look like a huge deficit, so they're left out.
  const counted = days.filter((d) => d.logged)
  if (!counted.length) {
    return (
      <section className="card">
        <h2>Calories</h2>
        <p className="muted small" style={{ margin: 0 }}>No food logged, so there's no deficit to show.</p>
      </section>
    )
  }
  const div = isWeek && !totals ? counted.length : 1
  const sum = (get: (d: DayEnergy) => number) => counted.reduce((s, d) => s + get(d), 0) / div
  const burned = sum((d) => d.burned)
  const eaten = sum((d) => d.eaten)
  const deficit = burned - eaten
  const surplus = deficit < 0
  const goalFor = goal != null && goal > 0 ? goal * (isWeek && totals ? counted.length : 1) : null
  const inDeficit = counted.filter((d) => d.deficit > 0).length
  const estimated = counted.some((d) => d.burnSource === 'estimate')
  const scope = !isWeek ? '' : totals ? ` over ${counted.length} days` : ' a day on average'

  return (
    <section className="card energy-card">
      <div className="energy-head">
        <div className="energy-label">{surplus ? 'Surplus' : 'Deficit'}{scope}</div>
        <div className="energy-big" style={{ color: surplus ? 'var(--warn)' : 'var(--accent)' }}>
          {surplus ? '+' : '−'}
          {fmt(deficit)} <span className="deficit-unit">kcal</span>
        </div>
        <div className="muted small">
          {goalFor != null && (surplus ? `Goal was a ${fmt(goalFor)} kcal deficit` : deficit >= goalFor ? `Goal of ${fmt(goalFor)} reached ✓` : `${fmt(goalFor - deficit)} short of the ${fmt(goalFor)} goal`)}
          {isWeek && `${goalFor != null ? ' · ' : ''}${inDeficit} of ${counted.length} days in deficit`}
        </div>
      </div>
      <div className="energy-pair">
        <div>
          <div className="deficit-mid" style={{ color: 'var(--accent)' }}>
            {fmt(burned)} <span className="deficit-unit">kcal</span>
          </div>
          <div className="muted small">Burned</div>
        </div>
        <div className="energy-minus" aria-hidden="true">−</div>
        <div style={{ textAlign: 'right' }}>
          <div className="deficit-mid" style={{ color: 'var(--warn)' }}>
            {fmt(eaten)} <span className="deficit-unit">kcal</span>
          </div>
          <div className="muted small">Eaten</div>
        </div>
      </div>
      {isWeek && (
        <div className="deficit-detail">
          {days.map((d) => (
            <div key={d.day} className="energy-row">
              <span>{weekday(d.day)}</span>
              {d.logged ? (
                <>
                  <span className="muted small">
                    {fmt(d.burned)} − {fmt(d.eaten)}
                  </span>
                  <b style={{ color: d.deficit < 0 ? 'var(--warn)' : 'var(--accent)' }}>
                    {d.deficit < 0 ? '+' : '−'}
                    {fmt(d.deficit)}
                  </b>
                </>
              ) : (
                <span className="muted small energy-none">no food logged</span>
              )}
            </div>
          ))}
          <div className="muted small">Burned − eaten each day; − is a deficit, + a surplus.</div>
        </div>
      )}
      {estimated && (
        <p className="muted small" style={{ margin: 0 }}>
          {isWeek
            ? `Burn estimated for ${counted.filter((d) => d.burnSource === 'estimate').map((d) => new Date(`${d.day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })).join(', ')} (no full Fitbit day imported).`
            : 'Burn is estimated (no full Fitbit day imported).'}
        </p>
      )}
    </section>
  )
}
