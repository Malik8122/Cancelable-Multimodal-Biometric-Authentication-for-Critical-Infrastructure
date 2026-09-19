import { motion } from 'motion/react'
import { AlertCircle, Check, Fingerprint, Loader2, Mic, ScanFace } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { enroll, enrollFace } from '../api/client'
import { ApiError, type EnrollResponse, type EnrollmentStatus, type FacePose, type RecordingQuality } from '../api/types'
import { EnrollmentStatusPill } from '../components/biometric/EnrollmentStatusPill'
import { FAIR_MESSAGE, POOR_MESSAGE, RecordingQualityPanel } from '../components/biometric/RecordingQualityPanel'
import { TemplateSetAnimation, animationTicks } from '../components/biometric/TemplateSetAnimation'
import { FingerprintCapture } from '../components/capture/FingerprintCapture'
import { GuidedFaceCapture, FACE_POSE_ORDER } from '../components/capture/GuidedFaceCapture'
import { VoiceCapture } from '../components/capture/VoiceCapture'
import { APPLICATION_ID } from '../config/app'
import { MODALITY_LABEL } from '../config/buildings'
import { useBuildings } from '../context/BuildingsContext'
import { useSession } from '../context/SessionContext'
import { useEnrollmentProfile } from '../hooks/useEnrollmentProfile'

type CardModality = 'face' | 'fingerprint' | 'voice'

interface Sample {
  blob: Blob
  filename: string
}

interface SubmitResult {
  message: string
  warning?: boolean
  /** Voice: the recording quality band to show ("Recording Quality: Excellent / Good / Fair"). */
  quality?: RecordingQuality
}

// Voice enrollment feedback that is not a plain error: a FAIR warning (continue or re-record) or a POOR rejection.
interface QualityNotice {
  quality: 'FAIR' | 'POOR'
}

const ICON: Record<CardModality, typeof ScanFace> = { face: ScanFace, fingerprint: Fingerprint, voice: Mic }

const describeEnrollment = (r: EnrollResponse) =>
  `${r.templates_created} template sets generated - Set ${r.active_template_set_version} is active.`

// One independent enrollment card. Enrolling (or re-enrolling) one modality never touches the others: the backend
// adds this modality's template to every live template set and leaves the other modalities' templates alone.
function EnrollmentCard({
  modality,
  title,
  blurb,
  status,
  highlighted,
  ready,
  poolSize,
  onSubmit,
  onDone,
  onFailed,
  resetKey,
  children,
}: {
  modality: CardModality
  title: string
  blurb: string
  status: EnrollmentStatus | undefined
  highlighted: boolean
  ready: boolean
  poolSize: number
  onSubmit: (acceptLowQuality?: boolean) => Promise<SubmitResult>
  onDone: () => void
  onFailed: () => void
  resetKey: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(highlighted)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<QualityNotice | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const Icon = ICON[modality]
  const enrolled = status === 'REGISTERED' || status === 'UPDATED'

  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlighted])

  useEffect(() => {
    if (!busy) return
    setTick(0)
    // Illustrative: capture -> template set 1..N -> pool. It holds on the last step until the real response arrives.
    const interval = window.setInterval(() => setTick((t) => Math.min(t + 1, animationTicks(poolSize) - 1)), 350)
    return () => window.clearInterval(interval)
  }, [busy, poolSize])

  const submit = async (acceptLowQuality = false) => {
    setBusy(true)
    setError(null)
    setResult(null)
    setNotice(null)
    try {
      const outcome = await onSubmit(acceptLowQuality)
      setTick(animationTicks(poolSize))
      setResult(outcome)
      setOpen(false)
      onDone()
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { status?: string } | undefined) : undefined
      if (body?.status === 'LOW_QUALITY_WARNING') {
        // Fair: nothing is stored yet. Keep the recordings so "Continue Enrollment" can use them, or "Re-record".
        setNotice({ quality: 'FAIR' })
      } else if (body?.status === 'ENROLLMENT_INCONSISTENT') {
        // Poor: rejected, nothing stored. Clear the recordings so the user records again.
        setNotice({ quality: 'POOR' })
        onFailed()
      } else {
        // Nothing was stored (e.g. no face detected): drop the captured samples and refresh the status.
        setError(err instanceof ApiError ? err.detail : 'The backend is unreachable.')
        onFailed()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      ref={cardRef}
      layout
      className={`rounded-2xl border bg-card/60 p-5 backdrop-blur-xl ${highlighted ? 'border-primary/50' : 'border-border'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
            <Icon className="h-5 w-5 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-base font-medium text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground">{blurb}</p>
          </div>
        </div>
        <EnrollmentStatusPill status={status} />
      </div>

      {result?.quality && (
        <div className="mt-4">
          <RecordingQualityPanel quality={result.quality} message={result.quality === 'FAIR' ? FAIR_MESSAGE : undefined} />
          <p className="-mt-2 text-xs text-success">{result.message}</p>
        </div>
      )}

      {result && !result.quality && (
        <p
          className={`mt-4 flex items-start gap-2 rounded-lg border p-3 text-xs ${
            result.warning ? 'border-warning/30 bg-warning/10 text-warning' : 'border-success/30 bg-success/10 text-success'
          }`}
        >
          {result.warning ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} /> : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
          {result.message}
        </p>
      )}

      {!open && !busy && (
        <div className="mt-4 flex flex-wrap gap-2">
          {enrolled ? (
            <>
              <button
                onClick={() => setOpen(true)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:border-white/25"
              >
                Update Enrollment
              </button>
              <button
                onClick={() => {
                  setResult(null)
                  setOpen(true)
                }}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground"
              >
                Re-enroll
              </button>
            </>
          ) : (
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg bg-primary px-5 py-2 text-xs font-medium text-primary-foreground shadow-md shadow-black/20 transition-opacity hover:opacity-90"
            >
              {status === 'RETRY_REQUIRED' ? 'Retry Enrollment' : `Enroll ${MODALITY_LABEL[modality]}`}
            </button>
          )}
        </div>
      )}

      {open && !busy && (
        <div key={resetKey} className="mt-4">
          {enrolled && (
            <p className="mb-3 text-xs text-muted-foreground">
              Your new sample replaces the existing {MODALITY_LABEL[modality].toLowerCase()} templates. Your other biometrics are not affected.
            </p>
          )}
          {notice?.quality === 'FAIR' && (
            <RecordingQualityPanel quality="FAIR" message={FAIR_MESSAGE}>
              <button
                onClick={() => void submit(true)}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-md shadow-black/20 transition-opacity hover:opacity-90"
              >
                Continue Enrollment
              </button>
              <button
                onClick={() => {
                  setNotice(null)
                  onFailed() // clear both recordings and remount the recorders
                }}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:border-white/25"
              >
                Re-record
              </button>
            </RecordingQualityPanel>
          )}
          {notice?.quality === 'POOR' && (
            <RecordingQualityPanel quality="POOR" message={POOR_MESSAGE}>
              <button
                onClick={() => setNotice(null)}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-md shadow-black/20 transition-opacity hover:opacity-90"
              >
                Record Again
              </button>
            </RecordingQualityPanel>
          )}
          {children}
          {error && (
            <p className="mt-3 flex items-start gap-2 text-xs text-danger">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} /> {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void submit(false)}
              disabled={!ready}
              className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground shadow-lg shadow-black/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {enrolled ? `Update ${MODALITY_LABEL[modality]} Enrollment` : `Enroll ${MODALITY_LABEL[modality]}`}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-xl border border-border px-5 py-3 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}

      {busy && (
        <div className="mt-5">
          <TemplateSetAnimation modalities={[modality]} poolSize={poolSize} tick={tick} />
          <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> Generating template sets&hellip;
          </p>
        </div>
      )}
    </motion.div>
  )
}

export function RegisterPage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const [searchParams] = useSearchParams()
  const focus = searchParams.get('focus')
  const { userId, health } = useSession()
  const { getBuilding } = useBuildings()
  const building = buildingId ? getBuilding(buildingId) : undefined
  const poolSize = health?.template_pool_size ?? 4
  const { statuses, enrolledList, error: loadError, refresh } = useEnrollmentProfile(userId)

  const [facePoses, setFacePoses] = useState<Partial<Record<FacePose, Blob>>>({})
  const [fingerprint, setFingerprint] = useState<Sample | null>(null)
  const [voiceOne, setVoiceOne] = useState<Sample | null>(null)
  const [voiceTwo, setVoiceTwo] = useState<Sample | null>(null)
  const [resetKey, setResetKey] = useState(0)

  const clearVoice = () => {
    setVoiceOne(null)
    setVoiceTwo(null)
    setResetKey((k) => k + 1)
  }
  const done = () => {
    setFacePoses({})
    setFingerprint(null)
    clearVoice()
    void refresh()
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pt-6 pb-14">
      {building && <p className="mb-2 text-center text-xs font-medium tracking-wide text-muted-foreground">{building.name}</p>}
      <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight text-foreground">Biometric Enrollment</h1>
      <p className="mx-auto mb-8 max-w-xl text-center text-sm text-muted-foreground">
        Enroll any combination of biometrics, independently and in any order. You choose which registered factors to use each
        time you authenticate.
      </p>

      {loadError && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} /> {loadError}
        </p>
      )}

      <div className="space-y-4">
        <EnrollmentCard
          modality="face"
          title="Face Enrollment"
          blurb="One-time guided enrollment: five poses - front, left, right, slightly up, slightly down."
          status={statuses.face}
          highlighted={focus === 'face'}
          ready={FACE_POSE_ORDER.every((pose) => facePoses[pose])}
          poolSize={poolSize}
          resetKey={resetKey}
          onDone={done}
          onFailed={() => {
            setFacePoses({})
            setResetKey((k) => k + 1)
            void refresh()
          }}
          onSubmit={async () => {
            // All five poses go in ONE request. The backend averages the valid embeddings into a centroid, discards them and
            // generates T1-T4 from the centroid alone; only the protected templates are stored.
            const response = await enrollFace(userId, APPLICATION_ID, facePoses as Record<FacePose, Blob>)
            return { message: `${describeEnrollment(response)} Enrolled from ${response.poses_valid ?? 5} guided poses.` }
          }}
        >
          <GuidedFaceCapture onChange={setFacePoses} />
        </EnrollmentCard>

        <EnrollmentCard
          modality="fingerprint"
          title="Fingerprint Enrollment"
          blurb="Upload a fingerprint image - PNG, JPG or JPEG. A high-resolution grayscale scan works best."
          status={statuses.fingerprint}
          highlighted={focus === 'fingerprint'}
          ready={!!fingerprint}
          poolSize={poolSize}
          resetKey={resetKey}
          onDone={done}
          onFailed={() => {
            setFingerprint(null)
            setResetKey((k) => k + 1)
            void refresh()
          }}
          onSubmit={async () => ({
            message: describeEnrollment(await enroll('fingerprint', userId, APPLICATION_ID, fingerprint!.blob, fingerprint!.filename)),
          })}
        >
          <FingerprintCapture mode="register" onCapture={(blob, filename) => setFingerprint({ blob, filename })} />
        </EnrollmentCard>

        <EnrollmentCard
          modality="voice"
          title="Voice Enrollment"
          blurb="Record the phrase twice, 4-5 seconds each. We check how well the two recordings match."
          status={statuses.voice}
          highlighted={focus === 'voice'}
          ready={!!voiceOne && !!voiceTwo}
          poolSize={poolSize}
          resetKey={resetKey}
          onDone={done}
          onFailed={() => {
            clearVoice()
            void refresh()
          }}
          onSubmit={async (acceptLowQuality) => {
            // ONE atomic request. The backend compares the two recordings (ECAPA embedding cosine similarity) BEFORE
            // storing anything: Excellent / Good -> enrolled; Fair -> 409 LOW_QUALITY_WARNING (stored only if the user
            // continues); Poor -> 422 ENROLLMENT_INCONSISTENT (nothing stored).
            const response = await enroll('voice', userId, APPLICATION_ID, voiceOne!.blob, voiceOne!.filename, {
              confirm: { sample: voiceTwo!.blob, filename: voiceTwo!.filename },
              acceptLowQuality,
            })
            return { message: describeEnrollment(response), quality: response.recording_quality }
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <VoiceCapture mode="register" title="Recording 1 of 2" onCapture={(blob, filename) => setVoiceOne({ blob, filename })} />
            <VoiceCapture mode="register" title="Recording 2 of 2" onCapture={(blob, filename) => setVoiceTwo({ blob, filename })} />
          </div>
        </EnrollmentCard>
      </div>

      {building && enrolledList.length > 0 && (
        <div className="mt-8 text-center">
          <Link
            to={`/building/${building.id}`}
            className="inline-block rounded-xl bg-primary px-10 py-3.5 text-sm font-medium text-primary-foreground shadow-lg shadow-black/20 transition-opacity hover:opacity-90"
          >
            Continue to {building.name}
          </Link>
        </div>
      )}
    </div>
  )
}
