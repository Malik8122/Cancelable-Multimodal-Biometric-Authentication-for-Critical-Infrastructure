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
import { ModalityChip } from '../components/biometric/ModalityChip'
import { getBuilding } from '../config/buildings'
import { useSession } from '../context/SessionContext'

const APPLICATION_ID = 'ncisn-security-network'

type Phase = 'select' | 'capture' | 'processing' | 'error'

interface Captured {
  blob: Blob
  filename: string
}

const MODALITY_META: Record<'face' | 'fingerprint' | 'voice', { label: string; icon: typeof ScanFace }> = {
  face: { label: 'Face', icon: ScanFace },
  fingerprint: { label: 'Fingerprint', icon: Fingerprint },
  voice: { label: 'Voice', icon: Mic },
}

function buildProcessingSteps(modalities: Modality[]) {
  const preprocessing = modalities.map((m) => ({
    key: `preprocess-${m}`,
    label: `Capturing ${m}`,
    icon: MODALITY_META[m as 'face' | 'fingerprint' | 'voice'].icon,
  }))
  return [
    ...preprocessing,
    { key: 'embed', label: 'Generating embeddings', icon: Sparkles },
    { key: 'biohash', label: 'Applying HKDF and BioHash', icon: Lock },
    { key: 'match', label: 'Matching stored template', icon: ShieldQuestion },
    { key: 'fusion', label: 'Fusion evaluation', icon: Layers },
    { key: 'decision', label: 'Security decision', icon: Check },
  ]
}

export function AuthenticatePage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const navigate = useNavigate()
  const { userId, recordAttempt } = useSession()
  const building = buildingId ? getBuilding(buildingId) : undefined

  const [selected, setSelected] = useState<Modality[]>(building?.requiredModalities ?? [])
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

  // Abort an in-flight authentication request if the page is left before it
  // settles - the request-scoped timers in handleSubmit are cleared in both
  // its try/catch branches already, but a mid-flight unmount is a third way
  // out that neither branch covers.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  if (!building) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-muted-foreground">Unknown facility.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Return to the campus
        </Link>
      </div>
    )
  }

  const toggle = (modality: Modality) => {
    const isDeselecting = selected.includes(modality)
    setSelected((prev) => (isDeselecting ? prev.filter((m) => m !== modality) : [...prev, modality]))
    // Deselecting a modality that was already captured must not leave its
    // sample behind - handleSubmit only reads `captured[modality]` for
    // whichever modalities end up in `selected`, but stale captured data
    // for a since-deselected modality has no reason to be kept around.
    if (isDeselecting) {
      setCaptured((prev) => {
        if (!(modality in prev)) return prev
        const next = { ...prev }
        delete next[modality]
        return next
      })
    }
  }

  const allCaptured = selected.every((m) => captured[m])

  const handleCapture = (modality: Modality) => (blob: Blob, filename: string) => {
    setCaptured((prev) => ({ ...prev, [modality]: { blob, filename } }))
  }

  const backToSelection = () => setPhase('select')

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

    // Illustrative step cadence for the preprocessing/embedding/biohash/match
    // stages (the backend does all of this inside one request-response - we
    // don't get granular server-sent progress) - the real network call runs
    // concurrently, and the final "decision generated" step only resolves
    // once the real response actually arrives (see below). The elapsed timer
    // above is real, measured client-side; there is no fake progress bar.
    const illustrativeSteps = steps.length - 1
    const stepInterval = window.setInterval(() => {
      setActiveStep((s) => (s < illustrativeSteps ? s + 1 : s))
    }, 420)

    // A real face+voice /authenticate/fusion request can legitimately take
    // 50+ seconds on the free-tier backend (face and voice are processed
    // sequentially, and either model may need to lazily load) - the notice
    // at 15s is purely informational (never implies failure), and the abort
    // at 90s is a generous ceiling for a genuinely hung request only; it must
    // never fire on a real, still-progressing one.
    const controller = new AbortController()
    abortControllerRef.current = controller
    const slowNoticeTimeoutId = window.setTimeout(() => setShowSlowNotice(true), 15_000)
    const abortTimeoutId = window.setTimeout(() => controller.abort(), 90_000)

    try {
      const samples = selected.map((modality) => ({
        modality,
        sample: captured[modality]!.blob,
        filename: captured[modality]!.filename,
      }))
      const result = await authenticateFusion(userId, APPLICATION_ID, samples, {
        buildingId: building.id,
        signal: controller.signal,
      })
      window.clearInterval(stepInterval)
      window.clearTimeout(slowNoticeTimeoutId)
      window.clearTimeout(abortTimeoutId)
      setActiveStep(steps.length)
      stopTimer()
      const finalLatency = Math.round(performance.now() - startedAtRef.current)

      recordAttempt({
        buildingId: building.id,
        modalitiesUsed: result.modalities_used,
        fusedScore: result.fused_score,
        fusionThreshold: result.fusion_threshold,
        authenticated: result.authenticated,
        latencyMs: finalLatency,
        perModality: result.results,
      })

      window.setTimeout(() => {
        navigate(`/building/${building.id}/result`, { state: { result, latencyMs: finalLatency } })
      }, 500)
    } catch (error) {
      window.clearInterval(stepInterval)
      window.clearTimeout(slowNoticeTimeoutId)
      window.clearTimeout(abortTimeoutId)
      stopTimer()
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
            <p className="mb-4 text-center text-sm text-muted-foreground">Select your authentication factors</p>
            <div className="mb-8 grid grid-cols-3 gap-3">
              {(Object.keys(MODALITY_META) as Array<keyof typeof MODALITY_META>).map((modality) => (
                <ModalityChip key={modality} modality={modality} selected={selected.includes(modality)} onToggle={() => toggle(modality)} />
              ))}
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
              onClick={backToSelection}
              className="mb-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              Change Selection
            </button>
            <div className="mb-3 grid grid-cols-1 gap-4 md:grid-cols-3">
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
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mt-3 text-xs text-muted-foreground/80"
                  >
                    Still verifying - this can take longer when the backend has been inactive.
                  </motion.p>
                )}
              </AnimatePresence>
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
                    <span className={`text-sm ${done ? 'text-success' : active ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {s.label}
                    </span>
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
