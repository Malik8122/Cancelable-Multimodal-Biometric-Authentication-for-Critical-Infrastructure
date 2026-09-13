import { AnimatePresence, motion } from 'framer-motion'
import { Camera, ScanFace, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'

interface Props {
  onCapture: (blob: Blob, filename: string) => void
  disabled?: boolean
}

export function FaceCapture({ onCapture, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [streamActive, setStreamActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    let stream: MediaStream | null = null
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user' } })
      .then((s) => {
        stream = s
        if (videoRef.current) videoRef.current.srcObject = s
        setStreamActive(true)
      })
      .catch((err) => setCameraError(err instanceof Error ? err.message : 'Camera access was denied.'))

    return () => stream?.getTracks().forEach((track) => track.stop())
  }, [])

  const capture = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx?.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) onCapture(blob, 'face.png')
    }, 'image/png')
    setFlash(true)
    window.setTimeout(() => setFlash(false), 250)
  }

  const handleFile = (file: File) => onCapture(file, file.name)

  return (
    <div className="rounded-lg border border-border bg-panel p-6">
      <div className="mb-4 flex items-center gap-2 text-text-muted">
        <ScanFace className="h-4 w-4" />
        <span className="font-mono text-xs tracking-wider uppercase">Face</span>
      </div>

      <div className="relative mb-4 aspect-video overflow-hidden rounded-md border border-border-bright bg-void">
        {streamActive ? (
          <>
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            {!reducedMotion && (
              <motion.div
                className="pointer-events-none absolute inset-x-0 h-px bg-accent/70 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                animate={{ y: ['0%', '100%', '0%'] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
              />
            )}
            <AnimatePresence>
              {flash && (
                <motion.div
                  initial={{ opacity: 0.9 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute inset-0 bg-white"
                />
              )}
            </AnimatePresence>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-text-dim">
            {cameraError ?? 'Requesting camera...'}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <motion.button
          onClick={capture}
          disabled={disabled || !streamActive}
          whileTap={disabled || !streamActive ? undefined : { scale: 0.96 }}
          className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent py-2 font-mono text-xs tracking-wide text-void uppercase transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Camera className="h-3.5 w-3.5" />
          Capture
        </motion.button>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 font-mono text-xs tracking-wide text-text-muted uppercase transition-colors hover:border-border-bright hover:text-text">
          <Upload className="h-3.5 w-3.5" />
          File
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      </div>
    </div>
  )
}
