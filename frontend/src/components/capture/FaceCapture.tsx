import { motion, AnimatePresence } from 'motion/react'
import { Camera, RotateCcw, ScanFace, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { GlowingEffect } from '../ui/glowing-effect'

interface Props {
  mode: 'register' | 'verify'
  onCapture: (blob: Blob, filename: string) => void
  disabled?: boolean
}

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png']

export function FaceCapture({ mode, onCapture, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [streamActive, setStreamActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
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
      if (blob) {
        onCapture(blob, 'face.png')
        setPreviewUrl(canvas.toDataURL('image/png'))
      }
    }, 'image/png')
    setFlash(true)
    window.setTimeout(() => setFlash(false), 220)
  }

  const retake = () => setPreviewUrl(null)

  const handleFile = (file: File) => {
    onCapture(file, file.name)
    setPreviewUrl(URL.createObjectURL(file))
  }

  return (
    <div className="relative rounded-2xl border border-border bg-card/60 p-6 backdrop-blur">
      <GlowingEffect disabled={false} proximity={80} spread={30} borderWidth={2} />
      <div className="relative mb-4 flex items-center gap-2 text-muted-foreground">
        <ScanFace className="h-4 w-4 text-primary" />
        <span className="font-mono text-xs tracking-[0.15em] uppercase">
          {mode === 'register' ? 'Face Registration' : 'Verify Face'}
        </span>
      </div>

      <div className="relative mb-4 aspect-video overflow-hidden rounded-xl border border-border bg-black">
        {previewUrl ? (
          <img src={previewUrl} alt="Captured face" className="h-full w-full object-cover" />
        ) : streamActive ? (
          <>
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            {/* Face bounding box + scanning grid overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-[70%] w-[60%]">
                <div className="absolute -inset-2 rounded-2xl border-2 border-primary/50" />
                {(['-top-1 -left-1', '-top-1 -right-1', '-bottom-1 -left-1', '-bottom-1 -right-1'] as const).map(
                  (pos) => (
                    <div
                      key={pos}
                      className={`absolute ${pos} h-4 w-4 border-primary ${pos.includes('top') ? 'border-t-2' : 'border-b-2'} ${pos.includes('left') ? 'border-l-2' : 'border-r-2'}`}
                    />
                  ),
                )}
                {!reducedMotion && (
                  <motion.div
                    className="absolute inset-x-0 h-px bg-primary shadow-[0_0_10px_var(--color-primary)]"
                    animate={{ y: ['0%', '100%', '0%'] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
                  />
                )}
              </div>
            </div>
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
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
            {cameraError ?? 'Initializing optical sensor array...'}
          </div>
        )}
      </div>

      <p className="relative mb-4 text-[11px] leading-relaxed text-muted-foreground">
        Position your face inside the frame &middot; ensure good lighting &middot; remove glasses if possible.
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
          <motion.button
            onClick={capture}
            disabled={disabled || !streamActive}
            whileTap={disabled || !streamActive ? undefined : { scale: 0.96 }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-mono text-xs tracking-wide text-primary-foreground uppercase shadow-[0_0_20px_color-mix(in_srgb,var(--color-primary)_40%,transparent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Camera className="h-3.5 w-3.5" />
            Capture
          </motion.button>
        )}
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 font-mono text-xs tracking-wide text-muted-foreground uppercase transition-colors hover:border-primary/50 hover:text-foreground">
          <Upload className="h-3.5 w-3.5" />
          Upload
          <input
            type="file"
            accept={ACCEPTED.join(',')}
            className="hidden"
            disabled={disabled}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      </div>
      <p className="relative mt-2 text-center font-mono text-[9px] tracking-wider text-muted-foreground/70 uppercase">
        Accepted formats: JPG &middot; JPEG &middot; PNG
      </p>
    </div>
  )
}
