import { motion } from 'motion/react'
import { AlertCircle, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { checkFacePose } from '../../api/client'
import { ApiError, type FacePose } from '../../api/types'
import { useReducedMotion } from '../../hooks/useReducedMotion'

export const FACE_POSE_ORDER: FacePose[] = ['front', 'left', 'right', 'up', 'down']

const POSES: Record<FacePose, { label: string; instruction: string; arrow: typeof ChevronUp | null; position: string }> = {
  front: { label: 'Front', instruction: 'Look straight at the camera', arrow: null, position: '' },
  left: { label: 'Left', instruction: 'Turn your head slightly to the left', arrow: ChevronLeft, position: 'left-2 top-1/2 -translate-y-1/2' },
  right: { label: 'Right', instruction: 'Turn your head slightly to the right', arrow: ChevronRight, position: 'right-2 top-1/2 -translate-y-1/2' },
  up: { label: 'Slight Up', instruction: 'Tilt your chin slightly up', arrow: ChevronUp, position: 'top-2 left-1/2 -translate-x-1/2' },
  down: { label: 'Slight Down', instruction: 'Tilt your chin slightly down', arrow: ChevronDown, position: 'bottom-2 left-1/2 -translate-x-1/2' },
}

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png']

interface Props {
  /** Called whenever the set of accepted poses changes. The enrollment is ready when all five are present. */
  onChange: (poses: Partial<Record<FacePose, Blob>>) => void
  disabled?: boolean
}

// One-time face enrollment as a 5-step guided experience with a circular face guide: Front, Left, Right, Slight Up, Slight
// Down. Each capture is checked by the backend immediately (MTCNN + blur check, nothing stored); a rejected pose - no face,
// or blurry - is retaken on the spot. Nothing else about a capture is judged. Authentication does NOT use this component:
// it is a single camera capture with no head-turn prompts.
export function GuidedFaceCapture({ onChange, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cancelledRef = useRef(false)
  const reducedMotion = useReducedMotion()

  const [streamActive, setStreamActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [poses, setPoses] = useState<Partial<Record<FacePose, Blob>>>({})
  const [step, setStep] = useState(0)
  const [checking, setChecking] = useState(false)
  const [rejection, setRejection] = useState<string | null>(null)

  useEffect(() => {
    cancelledRef.current = false
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user' } })
      .then((stream) => {
        if (cancelledRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play().catch(() => {})
        }
        setStreamActive(true)
      })
      .catch((err) => setCameraError(err instanceof Error ? err.message : 'Camera access was denied.'))
    return () => {
      cancelledRef.current = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const complete = FACE_POSE_ORDER.every((pose) => poses[pose])
  const currentPose = FACE_POSE_ORDER[Math.min(step, FACE_POSE_ORDER.length - 1)]
  const meta = POSES[currentPose]

  const grabFrame = (): Promise<Blob | null> => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return Promise.resolve(null)
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92))
  }

  // Ask the backend whether this capture is usable; accept it and move on, or explain and let the user retake.
  const submitCapture = async (blob: Blob | null, filename: string) => {
    if (!blob) {
      setRejection('The camera did not return an image. Please try again.')
      return
    }
    setChecking(true)
    setRejection(null)
    try {
      const verdict = await checkFacePose(currentPose, blob, filename)
      if (!verdict.valid) {
        setRejection(verdict.detail ?? 'This capture cannot be used. Please try again.')
        return
      }
      const next = { ...poses, [currentPose]: blob }
      setPoses(next)
      onChange(next)
      setStep((s) => Math.min(s + 1, FACE_POSE_ORDER.length))
    } catch (err) {
      setRejection(err instanceof ApiError ? err.detail : 'The backend is unreachable.')
    } finally {
      setChecking(false)
    }
  }

  const retakePose = (pose: FacePose) => {
    const next = { ...poses }
    delete next[pose]
    setPoses(next)
    onChange(next)
    setStep(FACE_POSE_ORDER.indexOf(pose))
    setRejection(null)
  }

  const ringClass = rejection ? 'border-danger' : complete ? 'border-success' : 'border-primary/70'
  const Arrow = complete ? null : meta.arrow

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-xl">
      <ol className="mb-5 flex flex-wrap justify-center gap-2" aria-label="Enrollment steps">
        {FACE_POSE_ORDER.map((pose, index) => {
          const done = !!poses[pose]
          const active = !complete && index === step
          return (
            <li key={pose}>
              <button
                type="button"
                disabled={!done || checking || disabled}
                onClick={() => retakePose(pose)}
                title={done ? `Retake ${POSES[pose].label}` : undefined}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                  done
                    ? 'border-success/30 bg-success/10 text-success hover:border-success/60'
                    : active
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground'
                }`}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={2} /> : <span>{index + 1}</span>}
                {POSES[pose].label}
              </button>
            </li>
          )
        })}
      </ol>

      {/* Circular face guide */}
      <div className="mx-auto mb-4 flex justify-center">
        <div className="relative h-64 w-64">
          <div className={`absolute inset-0 overflow-hidden rounded-full border-4 bg-black/50 transition-colors ${ringClass}`}>
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full scale-x-[-1] object-cover" />
            {!streamActive && (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-muted-foreground">
                {cameraError ?? 'Waiting for camera...'}
              </div>
            )}
          </div>
          {Arrow && (
            <motion.span
              key={currentPose}
              className={`absolute ${meta.position} flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg`}
              animate={reducedMotion ? undefined : { opacity: [1, 0.45, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              <Arrow className="h-5 w-5" strokeWidth={2.25} />
            </motion.span>
          )}
          {complete && (
            <span className="absolute right-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-full bg-success text-success-foreground shadow-lg">
              <Check className="h-5 w-5" strokeWidth={2.5} />
            </span>
          )}
        </div>
      </div>

      <div className="mb-4 text-center">
        {complete ? (
          <>
            <p className="text-sm font-medium text-success">All five poses captured</p>
            <p className="mt-1 text-xs text-muted-foreground">Select a pose above to retake it, or enroll now.</p>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Step {step + 1} of {FACE_POSE_ORDER.length}
            </p>
            <p className="text-base font-medium text-foreground">{meta.label}</p>
            <p className="text-sm text-muted-foreground">{meta.instruction}</p>
          </>
        )}
        {rejection && (
          <p className="mx-auto mt-3 flex max-w-xs items-start justify-center gap-1.5 text-xs text-danger">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} /> {rejection}
          </p>
        )}
      </div>

      {!complete && (
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => void grabFrame().then((blob) => submitCapture(blob, `face-${currentPose}.jpg`))}
            disabled={disabled || checking || !streamActive}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow-md shadow-black/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <Camera className="h-4 w-4" strokeWidth={1.5} />}
            {checking ? 'Checking...' : rejection ? 'Retake' : 'Capture'}
          </button>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground">
            <Upload className="h-4 w-4" strokeWidth={1.5} />
            Upload Photo
            <input
              type="file"
              accept={ACCEPTED.join(',')}
              className="hidden"
              disabled={disabled || checking}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void submitCapture(file, file.name)
              }}
            />
          </label>
        </div>
      )}
      <p className="mt-3 text-center text-xs text-muted-foreground/70">
        You only do this once. Good lighting helps; only blurry or undetected captures are rejected. Photo formats: PNG, JPG, JPEG.
      </p>
    </div>
  )
}
