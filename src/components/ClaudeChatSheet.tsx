import { useState } from 'react'
import { LABEL_PROMPT, RESTAURANT_PROMPT, looksLikeRestaurant, parseLabelJson, parseRestaurantJson, type RestaurantDish } from '../lib/foodJson'
import type { NewFood } from '../lib/foods'
import { Segmented } from './Fields'
import { Sheet } from './Sheet'

type Mode = 'label' | 'restaurant'

interface Props {
  initialMode?: Mode
  onClose: () => void
  onFood: (food: NewFood) => void
  onDish: (dish: RestaurantDish) => void
}

/** Free photo entry: copy a prompt into Claude chat with your photos, paste the JSON reply back. */
export function ClaudeChatSheet({ initialMode = 'label', onClose, onFood, onDish }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [copied, setCopied] = useState(false)
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(mode === 'label' ? LABEL_PROMPT : RESTAURANT_PROMPT)
      setCopied(true)
    } catch {
      setError("Couldn't copy automatically. Long-press the prompt below and copy it.")
    }
  }

  function importReply() {
    setError(null)
    try {
      // Whichever prompt was used, read the reply as what it is.
      if (looksLikeRestaurant(reply)) onDish(parseRestaurantJson(reply))
      else onFood(parseLabelJson(reply))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet title="Add with Claude chat" subtitle="Free: uses your Claude app, no API key" onClose={onClose}>
      <Segmented
        label="What are you adding?"
        value={mode}
        options={[
          { value: 'label', label: 'Package label' },
          { value: 'restaurant', label: 'Restaurant dish' },
        ]}
        onChange={(m) => {
          setMode(m)
          setCopied(false)
        }}
      />

      <ol className="steps">
        <li>
          <button type="button" className="btn" onClick={() => void copy()}>
            {copied ? 'Prompt copied ✓' : 'Copy prompt'}
          </button>
        </li>
        <li>
          Open{' '}
          <a href="https://claude.ai/new" target="_blank" rel="noreferrer">
            Claude
          </a>
          , paste the prompt and attach{' '}
          {mode === 'label' ? 'photos of the front, the nutrition facts and the ingredients' : 'a photo of the menu item and/or the plate'}.
        </li>
        <li>Copy Claude's whole reply and paste it here:</li>
      </ol>

      <div className="field">
        <label htmlFor="cc-reply" className="sr-only">
          Claude's reply
        </label>
        <textarea id="cc-reply" rows={6} value={reply} onChange={(e) => setReply(e.target.value)} placeholder='{ "name": … }' />
      </div>
      {error && (
        <p className="notice small" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn" disabled={!reply.trim()} onClick={importReply}>
        {mode === 'label' ? 'Review food' : 'Review dish'}
      </button>
      <p className="muted small">
        {mode === 'label'
          ? 'Next you check every value before it is saved. Values Claude estimated are marked.'
          : 'Next the ingredients open in the recipe builder so you can adjust portions before logging. Logged as "~ estimated".'}
      </p>

      <details className="small">
        <summary>Show the prompt</summary>
        <pre className="prompt-text">{mode === 'label' ? LABEL_PROMPT : RESTAURANT_PROMPT}</pre>
      </details>
    </Sheet>
  )
}
