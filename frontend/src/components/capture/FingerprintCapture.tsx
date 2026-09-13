import { AnimatePresence, motion } from 'motion/react'
import { Check, Fingerprint, RotateCcw, Upload } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { GlowingEffect } from '../ui/glowing-effect'

interface Props {
  mode: 'register' | 'verify'
  onCapture: (blob: Blob, filename: string) => void
  disabled?: boolean
}

const ACCEPTED = { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/bmp': ['.bmp'] }

// No physical fingerprint scanner exists in a browser context, so this
// accepts an uploaded scan image (matching how backend/api/enroll.py's
// fingerprint route already works - a decoded image, same as face) - the
// "scan pad" below is a visual metaphor, not a live sensor feed.
export function FingerprintCapture({ mode, onCapture, disabled }: Props) {
  const [scanning, setScanning] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [justScanned, setJustScanned] = useState(false)
  const reducedMotion = useReducedMotion()

  const handleFile = useCallback(
    (file: File) => {
      setPreviewUrl(URL.createObjectURL(file))
      setScanning(true)
      window.setTimeout(
        () => {
          setScanning(false)
          setJustScanned(true)
          onCapture(file, file.name)
          window.setTimeout(() => setJustScanned(false), 1000)
        },
        reducedMotion ? 0 : 1000,
      )
    },
    [onCapture, reducedMotion],
  )

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) handleFile(accepted[0])
    },
    [handleFile],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    multiple: false,
    disabled: disabled || scanning,
  })

  const retake = () => setPreviewUrl(null)

  return (
    <div className="relative rounded-2xl border border-border bg-card/60 p-6 backdrop-blur">
      <GlowingEffect disabled={false} proximity={80} spread={30} borderWidth={2} />
      <div className="relative mb-4 flex items-center gap-2 text-muted-foreground">
        <Fingerprint className="h-4 w-4 text-primary" />
        <span className="font-mono text-xs tracking-[0.15em] uppercase">
          {mode === 'register' ? 'Fingerprint Registration' : 'Verify Fingerprint'}
        </span>
      </div>

      <div
        {...getRootProps()}
        className={`relative mb-4 flex aspect-video cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-black transition-colors ${
          isDragActive ? 'border-primary' : 'border-border'
        }`}
      >
        <input {...getInputProps()} />
        {previewUrl ? (
          <img src={previewUrl} alt="Fingerprint scan" className="h-full w-full object-contain p-4" />
        ) : (
          <Fingerprint className={`h-16 w-16 ${scanning ? 'text-primary' : 'text-muted-foreground/40'}`} />
        )}

        <AnimatePresence>
          {justScanned && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/70"
            >
              <Check className="h-16 w-16 text-success" />
            </motion.div>
          )}
        </AnimatePresence>

        {scanning && !reducedMotion && (
          <motion.div
            className="absolute inset-x-0 h-1 bg-primary shadow-[0_0_16px_var(--color-primary)]"
            animate={{ y: ['0%', '2500%'] }}
            transition={{ duration: 1, ease: 'linear' }}
          />
        )}

        <span className="absolute bottom-3 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {justScanned ? 'Scan captured' : scanning ? 'Analyzing ridge pattern...' : 'Drop scan or click to upload'}
        </span>
      </div>

      <p className="relative mb-4 text-[11px] leading-relaxed text-muted-foreground">
        Upload a clear fingerprint scan &middot; center the fingerprint &middot; avoid blurry or rotated images.
      </p>

      <div className="relative flex gap-2">
        {previewUrl ? (
          <button
            onClick={retake}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-muted py-2.5 font-mono text-xs tracking-wide text-foreground uppercase transition-colors hover:border-primary/50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retake
          </button>
        ) : (
          <div
            {...getRootProps()}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-mono text-xs tracking-wide text-primary-foreground uppercase shadow-[0_0_20px_color-mix(in_srgb,var(--color-primary)_40%,transparent)] transition-opacity hover:opacity-90"
          >
            <input {...getInputProps()} />
            <Upload className="h-3.5 w-3.5" />
            Choose Scan File
          </div>
        )}
      </div>
      <p className="relative mt-2 text-center font-mono text-[9px] tracking-wider text-muted-foreground/70 uppercase">
        Accepted formats: PNG &middot; JPG &middot; JPEG &middot; BMP
      </p>
    </div>
  )
}
