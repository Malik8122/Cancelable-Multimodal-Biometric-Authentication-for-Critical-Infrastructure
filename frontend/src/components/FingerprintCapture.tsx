import { motion } from 'framer-motion'
import { Fingerprint, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'

interface Props {
  onCapture: (blob: Blob, filename: string) => void
  disabled?: boolean
}

// No physical fingerprint scanner exists in a browser context, so this
// accepts an uploaded scan image (matching how backend/api/enroll.py's
// fingerprint route already works - a decoded image, same as face/iris) -
// the "scan pad" below is a visual metaphor, not a live sensor feed.
export function FingerprintCapture({ onCapture, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const reducedMotion = useReducedMotion()

  const handleFile = (file: File) => {
    setScanning(true)
    window.setTimeout(
      () => {
        setScanning(false)
        onCapture(file, file.name)
      },
      reducedMotion ? 0 : 900,
    )
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-6">
      <div className="mb-4 flex items-center gap-2 text-text-muted">
        <Fingerprint className="h-4 w-4" />
        <span className="font-mono text-xs tracking-wider uppercase">Fingerprint</span>
      </div>

      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled || scanning}
        className="relative mb-4 flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-border-bright bg-void transition-colors hover:border-accent/50 disabled:cursor-not-allowed"
      >
        <Fingerprint className={`h-16 w-16 ${scanning ? 'text-accent' : 'text-text-dim'}`} />
        {scanning && !reducedMotion && (
          <motion.div
            className="absolute inset-x-0 h-1 bg-accent shadow-[0_0_12px_rgba(34,211,238,0.9)]"
            animate={{ y: ['0%', '2500%'] }}
            transition={{ duration: 0.9, ease: 'linear' }}
          />
        )}
        <span className="absolute bottom-2 font-mono text-[10px] text-text-dim uppercase">
          {scanning ? 'Scanning...' : 'Click to upload scan'}
        </span>
      </button>

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 font-mono text-xs tracking-wide text-text-muted uppercase transition-colors hover:border-border-bright hover:text-text">
        <Upload className="h-3.5 w-3.5" />
        Choose scan file
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled || scanning}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </label>
    </div>
  )
}
