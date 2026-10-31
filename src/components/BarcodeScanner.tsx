import { useEffect, useRef, useState } from 'react'
import { Sheet } from './Sheet'

interface Props {
  onDetected: (code: string) => void
  onClose: () => void
}

interface DetectorLike {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => DetectorLike
  }
}

/** Reads a product barcode with the camera (Chrome on Android); typing the number always works. */
export function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<string>(window.BarcodeDetector ? 'Starting camera…' : '')
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!window.BarcodeDetector) return
    let stream: MediaStream | null = null
    let stopped = false
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        const video = videoRef.current
        if (!video || stopped) return
        video.srcObject = stream
        await video.play()
        setStatus('Point the camera at the barcode.')
        while (!stopped) {
          const codes = await detector.detect(video).catch(() => [])
          if (codes[0]?.rawValue) {
            stopped = true
            navigator.vibrate?.(60)
            onDetected(codes[0].rawValue)
            return
          }
          await new Promise((r) => setTimeout(r, 250))
        }
      } catch {
        setStatus("Couldn't open the camera. Allow camera access, or type the number below.")
      }
    })()
    return () => {
      stopped = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onDetected])

  return (
    <Sheet title="Scan barcode" onClose={onClose}>
      {window.BarcodeDetector ? (
        <div className="scanner">
          <video ref={videoRef} muted playsInline />
          <p className="muted small">{status}</p>
        </div>
      ) : (
        <p className="muted small">This browser can't scan barcodes. On your Pixel, open the app in Chrome. You can also type the number.</p>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (typed.replace(/\D/g, '').length >= 6) onDetected(typed)
        }}
      >
        <input type="text" inputMode="numeric" aria-label="Barcode number" placeholder="Barcode number" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button type="submit" className="btn" style={{ flex: '0 0 auto' }}>
          Look up
        </button>
      </form>
    </Sheet>
  )
}
