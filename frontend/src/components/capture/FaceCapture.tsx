import { motion, AnimatePresence } from 'motion/react'
import { Camera, RotateCcw, ScanFace, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'

interface Props {
  mode: 'register' | 'verify'
  onCapture: (blob: Blob, filename: string) => void
  disabled?: boolean
}

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png']

export function FaceCapture({ mode, onCapture, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [streamActive, setStreamActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const reducedMotion = useReducedMotion()

  // <video> below is now ALWAYS mounted (never conditionally rendered), so
  // videoRef.current already exists by the time this effect's promise
  // resolves - srcObject can be assigned directly here, with no second
  // effect needed to wait for a later render. A previous fix moved the
  // assignment into a second useEffect keyed on streamActive instead of
  // fixing the actual issue (the element not existing yet) - that only
  // worked if the video element mounting actually happened synchronously
  // with that state flip, which conditional rendering doesn't guarantee
  // robustly across browsers. Explicit .play() is called defensively after
  // assigning srcObject: `autoplay` should suffice per spec once srcObject
  // is set on an already-mounted element, but a handful of Chromium/WebView
  // builds don't reliably resume it for a src assigned after initial mount.
  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user' } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          void videoRef.current.play().catch(() => {})
        }
        setStreamActive(true)
      })
      .catch((err) => setCameraError(err instanceof Error ? err.message : 'Camera access was denied.'))

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
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
    <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-2.5 text-foreground">
        <ScanFace className="h-4.5 w-4.5 text-primary" strokeWidth={1.5} />
        <span className="text-sm font-medium">{mode === 'register' ? 'Face Capture' : 'Verify Face'}</span>
      </div>

      <div className="mb-4 aspect-video overflow-hidden rounded-xl border border-border bg-black/40">
        <div className="relative h-full w-full">
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />

          {streamActive && !previewUrl && (
            <>
              {/* Minimal scanner corners */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[70%] w-[60%]">
                  {(['-top-1 -left-1', '-top-1 -right-1', '-bottom-1 -left-1', '-bottom-1 -right-1'] as const).map(
                    (pos) => (
                      <div
                        key={pos}
                        className={`absolute ${pos} h-5 w-5 border-white/60 ${pos.includes('top') ? 'border-t' : 'border-b'} ${pos.includes('left') ? 'border-l' : 'border-r'}`}
                      />
                    ),
                  )}
                  {!reducedMotion && (
                    <motion.div
                      className="absolute inset-x-0 h-px bg-white/40"
                      animate={{ y: ['0%', '100%', '0%'] }}
                      transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
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
          )}

          {previewUrl && <img src={previewUrl} alt="Captured face" className="absolute inset-0 h-full w-full object-cover" />}

          {!streamActive && !previewUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 px-6 text-center text-xs text-muted-foreground">
              {cameraError ?? 'Preparing camera...'}
            </div>
          )}
        </div>
      </div>

      <p className="mb-5 text-[13px] leading-relaxed text-muted-foreground">
        Position your face inside the frame, ensure good lighting, and remove glasses if possible.
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
          <button
            onClick={capture}
            disabled={disabled || !streamActive}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow-md shadow-black/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Camera className="h-4 w-4" strokeWidth={1.5} />
            Capture
          </button>
        )}
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground">
          <Upload className="h-4 w-4" strokeWidth={1.5} />
          Upload Instead
          <input
            type="file"
            accept={ACCEPTED.join(',')}
            className="hidden"
            disabled={disabled}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground/70">Accepted formats: PNG &bull; JPG &bull; JPEG</p>
    </div>
  )
}
