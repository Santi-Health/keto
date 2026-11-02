import { useState } from 'react'
import { useData } from '../lib/data'
import { download } from '../lib/exportData'
import { foodSheet, readFoodSheet, type SheetResult } from '../lib/foodSheet'
import { shortName } from '../lib/quickFoods'
import { localDate } from '../lib/targets'

/** All foods and drinks as one spreadsheet to edit elsewhere, then upload with a preview of what changes. */
export function FoodSheetCard() {
  const { foods, logs, updateFood, deleteFood } = useData()
  const [result, setResult] = useState<SheetResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const count = foods.filter((f) => !f.deleted_at).length

  async function pick(file: File | undefined) {
    if (!file) return
    setMessage(null)
    setResult(readFoodSheet(await file.text(), foods, logs))
  }

  function apply() {
    if (!result) return
    for (const c of result.changes) {
      if (c.remove) deleteFood(c.before.id)
      else updateFood(c.after)
    }
    const removed = result.changes.filter((c) => c.remove).length
    const edited = result.changes.length - removed
    setMessage(`Saved: ${edited} food${edited === 1 ? '' : 's'} changed${removed ? `, ${removed} deleted` : ''}.`)
    setResult(null)
  }

  return (
    <section className="card">
      <h2>My foods spreadsheet</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Every food and drink ({count}) with its names, where it shows on Add, portions and nutrition per 100 g. Open it in Google Sheets or Excel, edit the
        cells, save as CSV and upload it here. You see every change before it’s saved. Columns the app works out, like “shows as” and “shows under”, are for reading only; to move a food, edit “usual meals” or “sections”.
      </p>
      {message && <p className="notice small">{message}</p>}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn secondary" onClick={() => download(`my-foods-${localDate()}.csv`, foodSheet(foods, logs))}>
          Download my foods (CSV)
        </button>
        <label className="btn secondary">
          Upload edited sheet
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              void pick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {result && (
        <div className="sheet-preview">
          {result.problems.length > 0 && (
            <ul className="notice small">
              {result.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {result.changes.length ? (
            <>
              <div className="section-label">
                {result.changes.length} food{result.changes.length === 1 ? '' : 's'} to update
              </div>
              <ul className="sheet-changes">
                {result.changes.map((c) => (
                  <li key={c.before.id}>
                    <b>{shortName(c.before)}</b>
                    {c.remove ? (
                      <span className="danger-text"> · delete</span>
                    ) : (
                      c.changes.map((x) => (
                        <span key={x} className="small">
                          {x}
                        </span>
                      ))
                    )}
                  </li>
                ))}
              </ul>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn" onClick={apply}>
                  Save {result.changes.length} change{result.changes.length === 1 ? '' : 's'}
                </button>
                <button type="button" className="btn secondary" onClick={() => setResult(null)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <p className="muted small">Nothing changed in this sheet.</p>
          )}
        </div>
      )}
    </section>
  )
}
