import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, Check, Fingerprint, KeyRound, Lock, Mic, ScanFace, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { enroll } from '../api/client'
import { ApiError, type Modality } from '../api/types'
import { FaceCapture } from '../components/capture/FaceCapture'
import { FingerprintCapture } from '../components/capture/FingerprintCapture'
import { VoiceCapture } from '../components/capture/VoiceCapture'
import { Stepper } from '../components/biometric/Stepper'
import { getBuilding } from '../config/buildings'
import { useSession } from '../context/SessionContext'

const APPLICATION_ID = 'ncisn-security-network'

type Step = 'capture' | 'privacy' | 'submitting' | 'success' | 'error'

interface Captured {
  blob: Blob
  filename: string
}

const PIPELINE_STAGES = [
  { key: 'embed', label: 'Extracting biometric embeddings', icon: ScanFace },
  { key: 'hkdf', label: 'HKDF key generation', icon: KeyRound },
  { key: 'biohash', label: 'Cancelable BioHash transformation', icon: Lock },
  { key: 'store', label: 'Encrypted SQLite storage', icon: ShieldCheck },
]

const MODALITY_ICON: Record<'face' | 'fingerprint' | 'voice', typeof ScanFace> = {
  face: ScanFace,
  fingerprint: Fingerprint,
  voice: Mic,
}

export function RegisterPage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const navigate = useNavigate()
  const { userId } = useSession()
  const building = buildingId ? getBuilding(buildingId) : undefined
  const modalities = useMemo(() => building?.requiredModalities ?? [], [building])

  const [captured, setCaptured] = useState<Partial<Record<Modality, Captured>>>({})
  const [activeIndex, setActiveIndex] = useState(0)
  const [step, setStep] = useState<Step>('capture')
  const [pipelineStage, setPipelineStage] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [enrolledResults, setEnrolledResults] = useState<
    { modality: Modality; templateVersion: number; keyVersion: number; templateId: string }[]
  >([])

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

  const activeModality = modalities[activeIndex] as 'face' | 'fingerprint' | 'voice' | undefined

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
        if (stage >= PIPELINE_STAGES.length) {
          window.clearInterval(interval)
          resolve()
        }
      }, 700)
    })

  const handleProceed = async () => {
    setStep('submitting')
    setErrorMessage(null)
    try {
      await runPipelineAnimation()
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

  const progressSteps = [...modalities.map((m) => m.toUpperCase()), 'PROTECTED', 'COMPLETE']
  const currentProgressIndex =
    step === 'capture' ? activeIndex : step === 'privacy' || step === 'submitting' ? modalities.length : modalities.length + 1

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <p className="mb-2 text-center font-mono text-xs tracking-[0.25em] text-primary uppercase">{building.name}</p>
      <h1 className="mb-8 text-center text-xl font-semibold text-foreground">Biometric Registration</h1>

      <div className="mb-10">
        <Stepper steps={progressSteps} currentIndex={currentProgressIndex} />
      </div>

      <AnimatePresence mode="wait">
        {step === 'capture' && activeModality && (
          <motion.div key="capture" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-md">
            {activeModality === 'face' && <FaceCapture mode="register" onCapture={handleCapture('face')} />}
            {activeModality === 'fingerprint' && <FingerprintCapture mode="register" onCapture={handleCapture('fingerprint')} />}
            {activeModality === 'voice' && <VoiceCapture mode="register" onCapture={handleCapture('voice')} />}
          </motion.div>
        )}

        {step === 'privacy' && (
          <motion.div key="privacy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
            <PrivacyPreview modalities={modalities} />
            <button
              onClick={handleProceed}
              className="mt-8 rounded-lg bg-primary px-8 py-3 font-mono text-sm tracking-wide text-primary-foreground uppercase shadow-[0_0_24px_color-mix(in_srgb,var(--color-primary)_40%,transparent)] transition-opacity hover:opacity-90"
            >
              Protect &amp; Enroll Templates
            </button>
          </motion.div>
        )}

        {step === 'submitting' && (
          <motion.div key="submitting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PipelineAnimation activeStage={pipelineStage} />
          </motion.div>
        )}

        {step === 'error' && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-md text-center">
            <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorMessage}
            </div>
            <button
              onClick={handleProceed}
              className="rounded-lg border border-border px-6 py-2.5 font-mono text-xs tracking-wide text-foreground uppercase hover:border-primary/50"
            >
              Retry
            </button>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <motion.div
              initial={{ scale: 0.6, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="relative mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-full border-2 border-success/40"
            >
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-success/40"
                animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
              <ShieldCheck className="h-12 w-12 text-success" />
            </motion.div>
            <h2 className="mb-2 text-2xl font-semibold text-success uppercase">Enrollment Complete</h2>
            <p className="mb-6 text-sm text-muted-foreground">Protected templates stored. Security credential issued.</p>

            <div className="mx-auto mb-8 max-w-md rounded-xl border border-border bg-card/60 p-5 text-left">
              <dl className="grid grid-cols-2 gap-3 font-mono text-xs">
                <dt className="text-muted-foreground">User ID</dt>
                <dd className="text-right text-foreground">{userId}</dd>
                <dt className="text-muted-foreground">Completed</dt>
                <dd className="text-right text-foreground">{new Date().toLocaleTimeString()}</dd>
              </dl>
              <div className="mt-4 space-y-2 border-t border-border pt-4">
                {enrolledResults.map((r) => {
                  const Icon = MODALITY_ICON[r.modality as 'face' | 'fingerprint' | 'voice']
                  return (
                    <div key={r.modality} className="flex items-center justify-between font-mono text-[11px]">
                      <span className="flex items-center gap-1.5 text-muted-foreground uppercase">
                        <Icon className="h-3 w-3 text-primary" />
                        {r.modality}
                      </span>
                      <span className="text-foreground">
                        v{r.templateVersion} &middot; key {r.keyVersion}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <button
              onClick={() => navigate(`/building/${building.id}/authenticate`)}
              className="rounded-lg bg-primary px-8 py-3 font-mono text-sm tracking-wide text-primary-foreground uppercase shadow-[0_0_24px_color-mix(in_srgb,var(--color-primary)_40%,transparent)] transition-opacity hover:opacity-90"
            >
              Proceed to Authentication
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PrivacyPreview({ modalities }: { modalities: Modality[] }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card/60 p-8">
      <p className="mb-6 font-mono text-[10px] tracking-[0.2em] text-primary uppercase">Privacy Protection Pipeline</p>
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-3">
          {modalities.map((m) => {
            const Icon = MODALITY_ICON[m as 'face' | 'fingerprint' | 'voice']
            return (
              <div key={m} className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
            )
          })}
        </div>
        <BinaryStream />
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage.key} className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <stage.icon className="h-3.5 w-3.5 text-primary" />
            {stage.label}
          </div>
        ))}
        <BinaryStream />
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-success/40 bg-success/10">
          <Lock className="h-4 w-4 text-success" />
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Raw biometrics are discarded after embedding extraction. Only the protected, non-reversible template below is
        stored.
      </p>
    </div>
  )
}

function BinaryStream() {
  const bits = useMemo(() => Array.from({ length: 24 }, () => (Math.random() > 0.5 ? 1 : 0)), [])
  return (
    <div className="flex gap-0.5 font-mono text-[9px] text-primary/50">
      {bits.map((bit, i) => (
        <motion.span key={i} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.04 }}>
          {bit}
        </motion.span>
      ))}
    </div>
  )
}

function PipelineAnimation({ activeStage }: { activeStage: number }) {
  return (
    <div className="mx-auto max-w-md space-y-3">
      {PIPELINE_STAGES.map((stage, i) => {
        const done = i < activeStage
        const active = i === activeStage
        return (
          <motion.div
            key={stage.key}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
              done ? 'border-success/30 bg-success/5' : active ? 'border-primary/40 bg-primary/5' : 'border-border bg-card/40'
            }`}
          >
            {done ? (
              <Check className="h-4 w-4 text-success" />
            ) : active ? (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                <stage.icon className="h-4 w-4 text-primary" />
              </motion.div>
            ) : (
              <stage.icon className="h-4 w-4 text-muted-foreground" />
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
