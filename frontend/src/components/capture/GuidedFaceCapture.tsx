import { AlertCircle, Camera, Check, Loader2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { checkFacePose } from '../../api/client'
import { ApiError, type FacePose } from '../../api/types'

export const FACE_POSE_ORDER: FacePose[] = ['front', 'left', 'right', 'up', 'down']

// Five full-face, forward-facing captures, presented to the user as ONE "Face Registration"
// process (not five separate named steps) - NOT deliberate head turns, and no directional
// instructions, pose names, or arrows are shown anywhere in this component. The face
// preprocessing pipeline (preprocessing/face.py) crops by bounding box only, with no
// landmark-based rotation correction, so a deliberately rotated enrollment capture measurably
// hurts the resulting centroid's similarity to a normal, frontal live authentication capture
// (see the alignment investigation). The keys (front/left/right/up/down) below are unchanged
// internal identifiers only - the five-accepted-embeddings mechanism underneath (and everything
// backend/API-side) is unchanged; this is a presentation-only simplification.

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png']

//: How long the "Sample captured" confirmation shows before the UI returns to the idle prompt.
const CAPTURED_MESSAGE_MS = 1100

interface Props {
  /** Called whenever the set of accepted poses changes. The enrollment is ready when all five are present. */
  onChange: (poses: Partial<Record<FacePose, Blob>>) => void
  disabled?: boolean
}

// One-time "Face Registration": a single camera preview with a simple sample-count progress
// indicator, backed by the existing five-accepted-capture mechanism (five embeddings -> one
// centroid, unchanged). Each capture is checked by the backend immediately (face detection +
// quality gating, nothing stored); a rejected capture - no face, more than one face, blurry, too
// small/off-center/angled in frame, or low detection confidence - is retaken on the spot, exactly
// as before. Authentication does NOT use this component: it is a single camera capture with no
// guided prompts.
export function GuidedFaceCapture({ onChange, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cancelledRef = useRef(false)
  const capturedMessageTimeoutRef = useRef<number | null>(null)

  const [streamActive, setStreamActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [poses, setPoses] = useState<Partial<Record<FacePose, Blob>>>({})
  const [step, setStep] = useState(0)
  const [checking, setChecking] = useState(false)
  const [rejection, setRejection] = useState<string | null>(null)
  const [justCaptured, setJustCaptured] = useState(false)

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

  useEffect(() => {
    return () => {
      if (capturedMessageTimeoutRef.current !== null) window.clearTimeout(capturedMessageTimeoutRef.current)
    }
  }, [])

  // The progress indicator reflects only ACCEPTED captures - a rejected/retaken capture never
  // advances it, since `poses` only ever gains an entry once the backend has confirmed VALID.
  const acceptedCount = FACE_POSE_ORDER.filter((pose) => poses[pose]).length
  const complete = acceptedCount === FACE_POSE_ORDER.length
  const currentPose = FACE_POSE_ORDER[Math.min(step, FACE_POSE_ORDER.length - 1)]

  const grabFrame = (): Promise<Blob | null> => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return Promise.resolve(null)
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    // PNG (lossless), matching FaceCapture.tsx's authentication capture exactly - previously this
    // used lossy JPEG (q=0.92) while authentication used PNG, an unnecessary encoding difference
    // between the two capture paths (see the alignment investigation).
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
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
      setJustCaptured(true)
      if (capturedMessageTimeoutRef.current !== null) window.clearTimeout(capturedMessageTimeoutRef.current)
      capturedMessageTimeoutRef.current = window.setTimeout(() => setJustCaptured(false), CAPTURED_MESSAGE_MS)
    } catch (err) {
      setRejection(err instanceof ApiError ? err.detail : 'The backend is unreachable.')
    } finally {
      setChecking(false)
    }
  }

  const ringClass = rejection ? 'border-danger' : complete ? 'border-success' : 'border-primary/70'

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-xl">
      {/* "Face Registration" is this section's header (the enclosing EnrollmentCard's title in
          RegisterPage.tsx) - this is its subtitle, not a second header. */}
      <p className="mb-4 text-center text-sm text-muted-foreground">
        Look naturally at the camera. We&apos;ll take a few quick samples to create your face profile.
      </p>

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
          {complete && (
            <span className="absolute right-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-full bg-success text-success-foreground shadow-lg">
              <Check className="h-5 w-5" strokeWidth={2.5} />
            </span>
          )}
        </div>
      </div>

      {/* Progress: accepted-sample count only - a rejected/retaken capture never advances this. */}
      <div className="mb-4 flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1.5" role="img" aria-label={`${acceptedCount} of ${FACE_POSE_ORDER.length} samples captured`}>
          {FACE_POSE_ORDER.map((pose, index) => (
            <span
              key={pose}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                poses[pose] ? 'bg-success' : index === step && !complete ? 'border border-primary/60' : 'border border-border'
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {acceptedCount} of {FACE_POSE_ORDER.length} samples
        </p>
      </div>

      <div className="mb-4 text-center">
        {complete ? (
          <>
            <p className="text-sm font-medium text-success">Face registration complete</p>
            <p className="mt-1 text-xs text-muted-foreground">Your face profile has been created.</p>
          </>
        ) : justCaptured ? (
          <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-success">
            <Check className="h-4 w-4" strokeWidth={2.5} /> Sample captured
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Hold still and look at the camera.</p>
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
            onClick={() => void grabFrame().then((blob) => submitCapture(blob, `face-${currentPose}.png`))}
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
