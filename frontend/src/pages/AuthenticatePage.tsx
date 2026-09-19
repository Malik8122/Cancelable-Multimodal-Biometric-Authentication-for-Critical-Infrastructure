import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, ArrowLeft, Check, Fingerprint, Layers, Lock, Mic, ScanFace, ShieldQuestion, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { authenticateFusion } from '../api/client'
import { ApiError, type Modality } from '../api/types'
import { FaceCapture } from '../components/capture/FaceCapture'
import { FingerprintCapture } from '../components/capture/FingerprintCapture'
import { VoiceCapture } from '../components/capture/VoiceCapture'
import { ClearanceBadge } from '../components/biometric/ClearanceBadge'
import { EnrollmentStatusPill } from '../components/biometric/EnrollmentStatusPill'
import { APPLICATION_ID } from '../config/app'
import { FACTORS, MODALITY_LABEL } from '../config/buildings'
import { useBuildings } from '../context/BuildingsContext'
import { useSession } from '../context/SessionContext'
import { useEnrollmentProfile } from '../hooks/useEnrollmentProfile'

type Phase = 'select' | 'capture' | 'processing' | 'error'

interface Captured {
  blob: Blob
  filename: string
}

const ICON: Partial<Record<Modality, typeof ScanFace>> = { face: ScanFace, fingerprint: Fingerprint, voice: Mic }

function buildProcessingSteps(modalities: Modality[]) {
  const captured = modalities.map((m) => ({
    key: `captured-${m}`,
    label: `${MODALITY_LABEL[m]} captured`,
    icon: ICON[m] ?? ScanFace,
  }))
  return [
    ...captured,
    { key: 'embed', label: 'Generating embeddings', icon: Sparkles },
    { key: 'biohash', label: 'Applying HKDF and BioHash to the active template set', icon: Lock },
    { key: 'match', label: 'Template Matching', icon: ShieldQuestion },
    { key: 'fusion', label: 'Fusion Engine', icon: Layers },
    { key: 'decision', label: 'Access Decision', icon: Check },
  ]
}

// The USER chooses which enrolled factors to present in this session; the building is only the context. The backend
// authenticates and fuses exactly the factors submitted. A factor that is not enrolled cannot be selected (and if one
// is submitted anyway the backend answers ENROLLMENT_REQUIRED, which is shown as its own screen).
export function AuthenticatePage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const navigate = useNavigate()
  const { userId, recordAttempt } = useSession()
  const { getBuilding, status: buildingsStatus } = useBuildings()
  const building = buildingId ? getBuilding(buildingId) : undefined
  const { enrolled, statuses, loading: profileLoading } = useEnrollmentProfile(userId)

  const [selected, setSelected] = useState<Modality[]>([])
  const [phase, setPhase] = useState<Phase>('select')
  const [captured, setCaptured] = useState<Partial<Record<Modality, Captured>>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [showSlowNotice, setShowSlowNotice] = useState(false)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const steps = useMemo(() => buildProcessingSteps(selected), [selected])

  useEffect(() => {
    return () => abortControllerRef.current?.abort()
  }, [])

  if (!building) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-muted-foreground">{buildingsStatus === 'loading' ? 'Loading facility...' : 'Unknown facility.'}</p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Return to the campus
        </Link>
      </div>
    )
  }

  const toggle = (modality: Modality) => {
    const isDeselecting = selected.includes(modality)
    setSelected((prev) => (isDeselecting ? prev.filter((m) => m !== modality) : [...prev, modality]))
    if (isDeselecting) {
      setCaptured((prev) => {
        if (!(modality in prev)) return prev
        const next = { ...prev }
        delete next[modality]
        return next
      })
    }
  }

  const allCaptured = selected.length > 0 && selected.every((m) => captured[m])
  const handleCapture = (modality: Modality) => (blob: Blob, filename: string) => {
    setCaptured((prev) => ({ ...prev, [modality]: { blob, filename } }))
  }

  const startTimer = () => {
    startedAtRef.current = performance.now()
    timerRef.current = window.setInterval(() => setElapsedMs(Math.round(performance.now() - startedAtRef.current)), 47)
  }
  const stopTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
  }

  const handleSubmit = async () => {
    setPhase('processing')
    setErrorMessage(null)
    setActiveStep(0)
    setElapsedMs(0)
    setShowSlowNotice(false)
    startTimer()

    // Illustrative step cadence: the backend does all of this inside one request-response. The real decision only
    // resolves the last step when the response arrives. The elapsed timer is real, measured client-side.
    const illustrativeSteps = steps.length - 1
    const stepInterval = window.setInterval(() => setActiveStep((s) => (s < illustrativeSteps ? s + 1 : s)), 420)

    // A multi-modality request can legitimately take 50+ seconds on a cold free-tier backend; the notice at 15s is
    // informational only and the abort at 90s is a ceiling for a genuinely hung request.
    const controller = new AbortController()
    abortControllerRef.current = controller
    const slowNoticeTimeoutId = window.setTimeout(() => setShowSlowNotice(true), 15_000)
    const abortTimeoutId = window.setTimeout(() => controller.abort(), 90_000)
    const clearTimers = () => {
      window.clearInterval(stepInterval)
      window.clearTimeout(slowNoticeTimeoutId)
      window.clearTimeout(abortTimeoutId)
      stopTimer()
    }

    try {
      const samples = selected.map((modality) => ({
        modality,
        sample: captured[modality]!.blob,
        filename: captured[modality]!.filename,
      }))
      // The backend authenticates and fuses exactly these modalities.
      const result = await authenticateFusion(userId, APPLICATION_ID, samples, {
        buildingId: building.id,
        signal: controller.signal,
      })
      clearTimers()

      if (result.status === 'ENROLLMENT_REQUIRED') {
        // A submitted factor is not enrolled: nothing was verified - straight to the Enrollment Required screen.
        navigate(`/building/${building.id}/result`, { state: { result } })
        return
      }

      setActiveStep(steps.length)
      const finalLatency = Math.round(performance.now() - startedAtRef.current)
      recordAttempt({
        buildingId: building.id,
        modalitiesUsed: result.modalities_used,
        fusionSimilarity: result.fusion_similarity,
        fusionThreshold: result.fusion_threshold,
        authenticated: result.authenticated,
        latencyMs: finalLatency,
      })
      window.setTimeout(() => navigate(`/building/${building.id}/result`, { state: { result } }), 500)
    } catch (error) {
      clearTimers()
      setPhase('error')
      const timedOut = error instanceof DOMException && error.name === 'AbortError'
      setErrorMessage(
        timedOut
          ? 'Verification timed out. Please try again.'
          : error instanceof ApiError
            ? error.detail
            : 'The backend is unreachable. Is uvicorn running?',
      )
    } finally {
      abortControllerRef.current = null
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 pt-4 pb-14">
      <div className="mb-3 flex flex-col items-center gap-1.5 text-center">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">Identity Verification Portal</span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{building.name}</h1>
        <ClearanceBadge level={building.clearanceLevel} />
      </div>

      <AnimatePresence mode="wait">
        {phase === 'select' && (
          <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-xl">
            <p className="mb-1.5 mt-2 text-center text-sm text-foreground">Select biometric factors for this authentication session.</p>
            <p className="mb-5 text-center text-xs text-muted-foreground">Choose any of the factors you have registered.</p>
            <div className="mb-6 grid grid-cols-3 gap-3">
              {FACTORS.map((modality) => {
                const Icon = ICON[modality]!
                const isEnrolled = !!enrolled?.[modality]
                const isSelected = selected.includes(modality)
                return (
                  <div key={modality} className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={!isEnrolled}
                      aria-pressed={isSelected}
                      onClick={() => toggle(modality)}
                      className={`flex flex-col items-center gap-2.5 rounded-xl border px-4 py-6 transition-colors ${
                        isSelected
                          ? 'border-primary/60 bg-primary/10 text-primary'
                          : isEnrolled
                            ? 'border-border bg-card/60 text-muted-foreground hover:border-white/20'
                            : 'cursor-not-allowed border-dashed border-border bg-card/30 text-muted-foreground/50'
                      }`}
                    >
                      <Icon className="h-6 w-6" strokeWidth={1.5} />
                      <span className="text-sm font-medium">{MODALITY_LABEL[modality]}</span>
                    </button>
                    <div className="flex flex-col items-center gap-1">
                      {profileLoading ? <span className="text-[11px] text-muted-foreground">...</span> : <EnrollmentStatusPill status={statuses[modality]} />}
                      {!isEnrolled && !profileLoading && (
                        <Link to={`/building/${building.id}/register?focus=${modality}`} className="text-[11px] text-primary hover:underline">
                          Enroll {MODALITY_LABEL[modality].toLowerCase()}
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <button
              disabled={selected.length === 0}
              onClick={() => setPhase('capture')}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-medium text-primary-foreground shadow-lg shadow-black/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Begin Capture ({selected.length} factor{selected.length === 1 ? '' : 's'})
            </button>
          </motion.div>
        )}

        {phase === 'capture' && (
          <motion.div key="capture" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button
              onClick={() => setPhase('select')}
              className="mb-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              Change Factors
            </button>
            <div className={`mb-4 grid grid-cols-1 gap-4 ${selected.length > 1 ? 'md:grid-cols-2' : 'mx-auto max-w-md'} ${selected.length === 3 ? 'lg:grid-cols-3' : ''}`}>
              {selected.includes('face') && <FaceCapture mode="verify" onCapture={handleCapture('face')} />}
              {selected.includes('fingerprint') && <FingerprintCapture mode="verify" onCapture={handleCapture('fingerprint')} />}
              {selected.includes('voice') && <VoiceCapture mode="verify" onCapture={handleCapture('voice')} />}
            </div>
            <button
              onClick={handleSubmit}
              disabled={!allCaptured}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-medium text-primary-foreground shadow-lg shadow-black/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Submit for Verification
            </button>
          </motion.div>
        )}

        {phase === 'processing' && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-md">
            <div className="mb-8 text-center">
              <span className="text-4xl font-semibold tracking-tight text-foreground">{(elapsedMs / 1000).toFixed(2)}s</span>
              <p className="mt-1 text-xs text-muted-foreground">Elapsed time</p>
              <AnimatePresence>
                {showSlowNotice && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 text-xs text-muted-foreground/80">
                    Still verifying - this can take longer when the backend has been inactive.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            <div className="mb-5 flex flex-wrap justify-center gap-2">
              {selected.map((m) => {
                const Icon = ICON[m] ?? ScanFace
                return (
                  <span key={m} className="flex items-center gap-1.5 rounded-full border border-success/25 bg-success/5 px-3 py-1 text-xs font-medium text-success">
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {MODALITY_LABEL[m]}
                    <Check className="h-3 w-3" strokeWidth={2} />
                    <span className="text-success/80">Captured</span>
                  </span>
                )
              })}
            </div>
            <div className="space-y-2.5">
              {steps.map((s, i) => {
                const done = i < activeStep
                const active = i === activeStep
                return (
                  <motion.div
                    key={s.key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${
                      done ? 'border-success/25 bg-success/5' : active ? 'border-primary/30 bg-primary/5' : 'border-border bg-card/30'
                    }`}
                  >
                    {done ? (
                      <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={1.5} />
                    ) : active ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}>
                        <s.icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.5} />
                      </motion.div>
                    ) : (
                      <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                    )}
                    <span className={`text-sm ${done ? 'text-success' : active ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}

        {phase === 'error' && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-md text-center">
            <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              {errorMessage}
            </div>
            <button
              onClick={() => setPhase('capture')}
              className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-foreground hover:border-white/25"
            >
              Back to Capture
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
