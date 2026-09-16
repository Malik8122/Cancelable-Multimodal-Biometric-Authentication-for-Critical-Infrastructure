import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, ArrowLeft, Check, Database, Fingerprint, KeyRound, Loader2, Lock, Mic, ScanFace, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { enroll } from '../api/client'
import { ApiError, type Modality } from '../api/types'
import { FaceCapture } from '../components/capture/FaceCapture'
import { FingerprintCapture } from '../components/capture/FingerprintCapture'
import { VoiceCapture } from '../components/capture/VoiceCapture'
import { ModalityChip } from '../components/biometric/ModalityChip'
import { Stepper } from '../components/biometric/Stepper'
import { getBuilding } from '../config/buildings'
import { useSession } from '../context/SessionContext'

const APPLICATION_ID = 'ncisn-security-network'
const ALL_MODALITIES: Array<'face' | 'fingerprint' | 'voice'> = ['face', 'fingerprint', 'voice']

type Step = 'select' | 'capture' | 'privacy' | 'submitting' | 'securing' | 'success' | 'error'

interface Captured {
  blob: Blob
  filename: string
}

interface PipelineStage {
  key: string
  label: string
  icon: typeof ScanFace
}

const EMBED_STAGE: Record<'face' | 'fingerprint' | 'voice', PipelineStage> = {
  face: { key: 'face-embed', label: 'Face embedding', icon: ScanFace },
  fingerprint: { key: 'finger-embed', label: 'Fingerprint embedding', icon: Fingerprint },
  voice: { key: 'voice-embed', label: 'Voice embedding', icon: Mic },
}

const SHARED_STAGES: PipelineStage[] = [
  { key: 'hkdf', label: 'HKDF key generation', icon: KeyRound },
  { key: 'biohash', label: 'Cancelable BioHash', icon: Lock },
  { key: 'template', label: 'Protected template assembled', icon: ShieldCheck },
  { key: 'store', label: 'Secure database storage', icon: Database },
]

const MODALITY_ICON: Record<'face' | 'fingerprint' | 'voice', typeof ScanFace> = {
  face: ScanFace,
  fingerprint: Fingerprint,
  voice: Mic,
}

const MODALITY_LABEL: Record<'face' | 'fingerprint' | 'voice', string> = {
  face: 'Face',
  fingerprint: 'Fingerprint',
  voice: 'Voice',
}

export function RegisterPage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const navigate = useNavigate()
  const { userId } = useSession()
  const building = buildingId ? getBuilding(buildingId) : undefined

  const [selected, setSelected] = useState<Array<'face' | 'fingerprint' | 'voice'>>(
    () => (building?.requiredModalities.filter((m): m is 'face' | 'fingerprint' | 'voice' => m !== 'iris') ?? ['face']),
  )
  const [captured, setCaptured] = useState<Partial<Record<Modality, Captured>>>({})
  const [activeIndex, setActiveIndex] = useState(0)
  const [step, setStep] = useState<Step>('select')
  const [pipelineStage, setPipelineStage] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [enrolledResults, setEnrolledResults] = useState<
    { modality: Modality; templateVersion: number; keyVersion: number; templateId: string }[]
  >([])

  const modalities = selected
  const pipelineStages = useMemo(() => [...selected.map((m) => EMBED_STAGE[m]), ...SHARED_STAGES], [selected])
  const stepLabels = useMemo(() => [...selected.map((m) => MODALITY_LABEL[m]), 'Secure Template'], [selected])

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

  const toggleModality = (modality: 'face' | 'fingerprint' | 'voice') => {
    const isDeselecting = selected.includes(modality)
    setSelected((prev) => (isDeselecting ? prev.filter((m) => m !== modality) : [...prev, modality]))
    // Deselecting a modality that was already captured must not leave its
    // biometric data behind - it would otherwise still get enrolled in
    // handleProceed (which only checks `captured[modality]`, not `selected`).
    if (isDeselecting) {
      setCaptured((prev) => {
        if (!(modality in prev)) return prev
        const next = { ...prev }
        delete next[modality]
        return next
      })
    }
  }

  const beginCapture = () => {
    setActiveIndex(0)
    setStep('capture')
  }

  const backToSelection = () => {
    setActiveIndex(0)
    setStep('select')
  }

  const activeModality = modalities[activeIndex]

  const handleCapture = (modality: Modality) => (blob: Blob, filename: string) => {
    setCaptured((prev) => ({ ...prev, [modality]: { blob, filename } }))
    window.setTimeout(() => {
      setActiveIndex((i) => (i + 1 < modalities.length ? i + 1 : i))
      if (activeIndex + 1 >= modalities.length) setStep('privacy')
    }, 700)
  }

  const runPipelineAnimation = () =>
    new Promise<void>((resolve) => {
      let stage = 0
      setPipelineStage(0)
      const interval = window.setInterval(() => {
        stage += 1
        setPipelineStage(stage)
        if (stage >= pipelineStages.length) {
          window.clearInterval(interval)
          resolve()
        }
      }, 550)
    })

  const handleProceed = async () => {
    setStep('submitting')
    setErrorMessage(null)
    try {
      await runPipelineAnimation()
      // The animation above is illustrative/timed, not tied to real request
      // completion - it always finishes in ~3.3s regardless of how long the
      // actual enroll() calls below take. Without a distinct phase here, the
      // UI would sit on a fully-green, no-longer-animating checklist for
      // however long the real (possibly slow: cold start, first-time model
      // load, etc.) network requests take, indistinguishable from "stuck".
      setStep('securing')
      const results: typeof enrolledResults = []
      for (const modality of modalities) {
        const sample = captured[modality]
        if (!sample) continue
        const response = await enroll(modality, userId, APPLICATION_ID, sample.blob, sample.filename)
        results.push({
          modality,
          templateVersion: response.template_version,
          keyVersion: response.key_version,
          templateId: response.template_id,
        })
      }
      setEnrolledResults(results)
      setStep('success')
    } catch (error) {
      setStep('error')
      setErrorMessage(error instanceof ApiError ? error.detail : 'The backend is unreachable. Is uvicorn running?')
    }
  }

  const currentProgressIndex = step === 'capture' ? activeIndex : stepLabels.length - 1

  return (
    <div className="mx-auto max-w-3xl px-6 pt-6 pb-14">
      <p className="mb-2 text-center text-xs font-medium tracking-wide text-muted-foreground">{building.name}</p>
      <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight text-foreground">Register Biometrics</h1>

      {step !== 'select' && (
        <div className="mb-8">
          <Stepper steps={stepLabels} currentIndex={currentProgressIndex} />
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === 'select' && (
          <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-xl">
            <p className="mb-1.5 text-center text-sm text-muted-foreground">Choose which biometrics to register</p>
            <p className="mb-6 text-center text-xs text-muted-foreground/70">
              Register fingerprint only, face and fingerprint, or all three - any combination is supported for every
              facility.
            </p>
            <div className="mb-4 grid grid-cols-3 gap-3">
              {ALL_MODALITIES.map((modality) => (
                <ModalityChip
                  key={modality}
                  modality={modality}
                  selected={selected.includes(modality)}
                  onToggle={() => toggleModality(modality)}
                />
              ))}
            </div>
            <p className="mb-8 text-center text-xs text-muted-foreground/70">
              Recommended for {building.name}: {building.requiredModalities.map((m) => MODALITY_LABEL[m as 'face' | 'fingerprint' | 'voice'] ?? m).join(', ')}
            </p>
            <button
              disabled={selected.length === 0}
              onClick={beginCapture}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-medium text-primary-foreground shadow-lg shadow-black/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Continue ({selected.length} factor{selected.length === 1 ? '' : 's'})
            </button>
          </motion.div>
        )}

        {step === 'capture' && activeModality && (
          <motion.div key="capture" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-md">
            <button
              onClick={backToSelection}
              className="mb-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              Change Selection
            </button>
            {activeModality === 'face' && <FaceCapture mode="register" onCapture={handleCapture('face')} />}
            {activeModality === 'fingerprint' && <FingerprintCapture mode="register" onCapture={handleCapture('fingerprint')} />}
            {activeModality === 'voice' && <VoiceCapture mode="register" onCapture={handleCapture('voice')} />}
          </motion.div>
        )}

        {step === 'privacy' && (
          <motion.div key="privacy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
            <PrivacyPreview modalities={selected} stages={pipelineStages} />
            <button
              onClick={handleProceed}
              className="mt-8 rounded-xl bg-primary px-10 py-3.5 text-sm font-medium text-primary-foreground shadow-lg shadow-black/20 transition-opacity hover:opacity-90"
            >
              Protect &amp; Enroll Templates
            </button>
          </motion.div>
        )}

        {step === 'submitting' && (
          <motion.div key="submitting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PipelineAnimation activeStage={pipelineStage} stages={pipelineStages} />
          </motion.div>
        )}

        {step === 'securing' && (
          <motion.div key="securing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-md text-center">
            <motion.div
              className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 className="h-6 w-6 text-primary" strokeWidth={1.5} />
            </motion.div>
            <p className="text-sm font-medium text-foreground">Securing biometric templates&hellip;</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Finalizing secure enrollment - this can take a moment on a cold backend.
            </p>
          </motion.div>
        )}

        {step === 'error' && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-md text-center">
            <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              {errorMessage}
            </div>
            <button
              onClick={handleProceed}
              className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-foreground hover:border-white/25"
            >
              Retry
            </button>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div key="success" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-success/30 bg-success/10"
            >
              <ShieldCheck className="h-10 w-10 text-success" strokeWidth={1.5} />
            </motion.div>
            <h2 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">Enrollment Complete</h2>
            <p className="mb-8 text-sm text-muted-foreground">Protected templates stored. A security credential has been issued.</p>

            <div className="mx-auto mb-8 max-w-md rounded-xl border border-border bg-card/60 p-5 text-left backdrop-blur-xl">
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <dt className="text-muted-foreground">User ID</dt>
                <dd className="text-right text-foreground">{userId}</dd>
                <dt className="text-muted-foreground">Completed</dt>
                <dd className="text-right text-foreground">{new Date().toLocaleTimeString()}</dd>
              </dl>
              <div className="mt-4 space-y-2.5 border-t border-border pt-4">
                {enrolledResults.map((r) => {
                  const Icon = MODALITY_ICON[r.modality as 'face' | 'fingerprint' | 'voice']
                  return (
                    <div key={r.modality} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-muted-foreground capitalize">
                        <Icon className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
                        {r.modality}
                      </span>
                      <span className="text-foreground">
                        Template v{r.templateVersion} &middot; Key v{r.keyVersion}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <button
              onClick={() => navigate(`/building/${building.id}/authenticate`)}
              className="rounded-xl bg-primary px-10 py-3.5 text-sm font-medium text-primary-foreground shadow-lg shadow-black/20 transition-opacity hover:opacity-90"
            >
              Proceed to Authentication
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PrivacyPreview({ modalities, stages }: { modalities: Array<'face' | 'fingerprint' | 'voice'>; stages: PipelineStage[] }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card/60 p-8 backdrop-blur-xl">
      <p className="mb-6 text-xs font-medium tracking-wide text-muted-foreground">Privacy Protection Pipeline</p>
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-3">
          {modalities.map((m) => {
            const Icon = MODALITY_ICON[m]
            return (
              <div key={m} className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
                <Icon className="h-4.5 w-4.5 text-primary" strokeWidth={1.5} />
              </div>
            )
          })}
        </div>
        <ParticleStream />
        <div className="space-y-2">
          {stages.map((stage) => (
            <div key={stage.key} className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <stage.icon className="h-4 w-4 text-primary" strokeWidth={1.5} />
              {stage.label}
            </div>
          ))}
        </div>
        <ParticleStream />
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-success/30 bg-success/10">
          <Lock className="h-4.5 w-4.5 text-success" strokeWidth={1.5} />
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Raw biometrics are discarded after embedding extraction. Only the protected, non-reversible template below is
        stored.
      </p>
    </div>
  )
}

function ParticleStream() {
  const particles = useMemo(() => Array.from({ length: 18 }, (_, i) => i), [])
  return (
    <div className="flex gap-1.5">
      {particles.map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-primary/60"
          animate={{ opacity: [0.15, 0.9, 0.15] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.06 }}
        />
      ))}
    </div>
  )
}

function PipelineAnimation({ activeStage, stages }: { activeStage: number; stages: PipelineStage[] }) {
  return (
    <div className="mx-auto max-w-md space-y-3">
      {stages.map((stage, i) => {
        const done = i < activeStage
        const active = i === activeStage
        return (
          <motion.div
            key={stage.key}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
              done ? 'border-success/25 bg-success/5' : active ? 'border-primary/30 bg-primary/5' : 'border-border bg-card/40'
            }`}
          >
            {done ? (
              <Check className="h-4 w-4 text-success" strokeWidth={1.5} />
            ) : active ? (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}>
                <stage.icon className="h-4 w-4 text-primary" strokeWidth={1.5} />
              </motion.div>
            ) : (
              <stage.icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            )}
            <span className={`text-sm ${done ? 'text-success' : active ? 'text-foreground' : 'text-muted-foreground'}`}>
              {stage.label}
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}
