import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, Check, Fingerprint, Layers, Lock, Mic, ScanFace, ShieldQuestion, Sparkles } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { authenticateFusion } from '../api/client'
import { ApiError, type Modality } from '../api/types'
import { FaceCapture } from '../components/capture/FaceCapture'
import { FingerprintCapture } from '../components/capture/FingerprintCapture'
import { VoiceCapture } from '../components/capture/VoiceCapture'
import { ModalityChip } from '../components/biometric/ModalityChip'
import { SecurityStrengthMeter } from '../components/biometric/SecurityStrengthMeter'
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
    label: `${m[0].toUpperCase()}${m.slice(1)} preprocessing complete`,
    icon: MODALITY_META[m as 'face' | 'fingerprint' | 'voice'].icon,
  }))
  return [
    ...preprocessing,
    { key: 'embed', label: 'Embedding extraction', icon: Sparkles },
    { key: 'biohash', label: 'Cancelable template generated', icon: Lock },
    { key: 'match', label: 'Protected template matched', icon: ShieldQuestion },
    { key: 'fusion', label: 'Fusion engine evaluating', icon: Layers },
    { key: 'decision', label: 'Security decision generated', icon: Check },
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
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)

  const steps = useMemo(() => buildProcessingSteps(selected), [selected])

  if (!building) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-muted-foreground">Unknown facility.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Return to Security Operations Center
        </Link>
      </div>
    )
  }

  const toggle = (modality: Modality) => {
    setSelected((prev) => (prev.includes(modality) ? prev.filter((m) => m !== modality) : [...prev, modality]))
  }

  const allCaptured = selected.every((m) => captured[m])

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
    startTimer()

    // Illustrative step cadence for the preprocessing/embedding/biohash/match
    // stages (the backend does all of this inside one request-response - we
    // don't get granular server-sent progress) - the real network call runs
    // concurrently, and the final "decision generated" step only resolves
    // once the real response actually arrives (see below).
    const illustrativeSteps = steps.length - 1
    const stepInterval = window.setInterval(() => {
      setActiveStep((s) => (s < illustrativeSteps ? s + 1 : s))
    }, 420)

    try {
      const samples = selected.map((modality) => ({
        modality,
        sample: captured[modality]!.blob,
        filename: captured[modality]!.filename,
      }))
      const result = await authenticateFusion(userId, APPLICATION_ID, samples, { buildingId: building.id })
      window.clearInterval(stepInterval)
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
      stopTimer()
      setPhase('error')
      setErrorMessage(error instanceof ApiError ? error.detail : 'The backend is unreachable. Is uvicorn running?')
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className="mb-2 text-center font-mono text-xs tracking-[0.25em] text-primary uppercase">Identity Verification Portal</p>
      <h1 className="mb-10 text-center text-xl font-semibold text-foreground">{building.name}</h1>

      <AnimatePresence mode="wait">
        {phase === 'select' && (
          <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-xl">
            <p className="mb-4 text-center font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Select authentication factors
            </p>
            <div className="mb-6 grid grid-cols-3 gap-3">
              {(Object.keys(MODALITY_META) as Array<keyof typeof MODALITY_META>).map((modality) => (
                <ModalityChip key={modality} modality={modality} selected={selected.includes(modality)} onToggle={() => toggle(modality)} />
              ))}
            </div>
            <div className="mb-6">
              <SecurityStrengthMeter modalities={selected} />
            </div>
            <button
              disabled={selected.length === 0}
              onClick={() => setPhase('capture')}
              className="w-full rounded-lg bg-primary py-3 font-mono text-sm tracking-wide text-primary-foreground uppercase shadow-[0_0_24px_color-mix(in_srgb,var(--color-primary)_40%,transparent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Begin Capture ({selected.length} factor{selected.length === 1 ? '' : 's'})
            </button>
          </motion.div>
        )}

        {phase === 'capture' && (
          <motion.div key="capture" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              {selected.includes('face') && <FaceCapture mode="verify" onCapture={handleCapture('face')} />}
              {selected.includes('fingerprint') && <FingerprintCapture mode="verify" onCapture={handleCapture('fingerprint')} />}
              {selected.includes('voice') && <VoiceCapture mode="verify" onCapture={handleCapture('voice')} />}
            </div>
            <button
              onClick={handleSubmit}
              disabled={!allCaptured}
              className="w-full rounded-lg bg-primary py-3 font-mono text-sm tracking-wide text-primary-foreground uppercase shadow-[0_0_24px_color-mix(in_srgb,var(--color-primary)_40%,transparent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Submit for Verification
            </button>
          </motion.div>
        )}

        {phase === 'processing' && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-md">
            <div className="mb-6 text-center">
              <span className="font-mono text-3xl font-semibold tracking-wider text-primary">
                {(elapsedMs / 1000).toFixed(2)}s
              </span>
              <p className="font-mono text-[9px] tracking-wider text-muted-foreground uppercase">Live processing timer</p>
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
                      done ? 'border-success/30 bg-success/5' : active ? 'border-primary/40 bg-primary/5' : 'border-border bg-card/30'
                    }`}
                  >
                    {done ? (
                      <Check className="h-4 w-4 shrink-0 text-success" />
                    ) : active ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}>
                        <s.icon className="h-4 w-4 shrink-0 text-primary" />
                      </motion.div>
                    ) : (
                      <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
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
            <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorMessage}
            </div>
            <button
              onClick={() => setPhase('capture')}
              className="rounded-lg border border-border px-6 py-2.5 font-mono text-xs tracking-wide text-foreground uppercase hover:border-primary/50"
            >
              Back to Capture
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
