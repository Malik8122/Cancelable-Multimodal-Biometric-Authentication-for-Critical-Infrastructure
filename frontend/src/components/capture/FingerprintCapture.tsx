import { AnimatePresence, motion } from 'motion/react'
import { Check, Fingerprint, RotateCcw, Upload } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useReducedMotion } from '../../hooks/useReducedMotion'

interface Props {
  mode: 'register' | 'verify'
  onCapture: (blob: Blob, filename: string) => void
  disabled?: boolean
}

const ACCEPTED = { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] }

// No physical fingerprint scanner exists in a browser context, so this
// accepts an uploaded scan image (matching how backend/api/enroll.py's
// fingerprint route already works - a decoded image, same as face) - the
// scan pad below is a visual metaphor, not a live sensor feed.
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
        reducedMotion ? 0 : 1200,
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
    <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-2.5 text-foreground">
        <Fingerprint className="h-4.5 w-4.5 text-primary" strokeWidth={1.5} />
        <span className="text-sm font-medium">{mode === 'register' ? 'Fingerprint Capture' : 'Verify Fingerprint'}</span>
      </div>

      <div
        {...getRootProps()}
        className={`relative mb-4 flex aspect-video cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-black/40 transition-colors ${
          isDragActive ? 'border-primary/60' : 'border-border'
        }`}
      >
        <input {...getInputProps()} />
        {previewUrl ? (
          <img src={previewUrl} alt="Fingerprint scan" className="h-full w-full object-contain p-4" />
        ) : (
          <Fingerprint className={`h-14 w-14 ${scanning ? 'text-primary' : 'text-muted-foreground/40'}`} strokeWidth={1.25} />
        )}

        <AnimatePresence>
          {justScanned && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/60"
            >
              <Check className="h-14 w-14 text-success" strokeWidth={1.5} />
            </motion.div>
          )}
        </AnimatePresence>

        {scanning && !reducedMotion && (
          <motion.div
            className="absolute inset-x-0 h-px bg-primary/80"
            animate={{ y: ['0%', '2500%'] }}
            transition={{ duration: 1.2, ease: 'linear' }}
          />
        )}

        <span className="absolute bottom-3 text-xs text-muted-foreground">
          {justScanned ? 'Scan captured' : scanning ? 'Analyzing ridge pattern...' : 'Drop a scan or click to upload'}
        </span>
      </div>

      <p className="mb-5 text-[13px] leading-relaxed text-muted-foreground">
        Upload a clear fingerprint scan, centered in frame, avoiding blurry or rotated images. Recommended: a high-resolution grayscale scan.
      </p>

      <div className="flex gap-2.5">
        {previewUrl ? (
          <button
            onClick={retake}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:border-white/25"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
            Retake
          </button>
        ) : (
          <div
            {...getRootProps()}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow-md shadow-black/20 transition-opacity hover:opacity-90"
          >
            <input {...getInputProps()} />
            <Upload className="h-4 w-4" strokeWidth={1.5} />
            Upload Instead
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground/70">
        Supported formats: PNG &bull; JPG &bull; JPEG
      </p>
    </div>
  )
}
