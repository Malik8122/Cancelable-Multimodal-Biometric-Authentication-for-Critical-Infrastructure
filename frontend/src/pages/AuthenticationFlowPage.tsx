import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, ScanLine } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { authenticateFusion, enroll, getUser, type FusionSample } from '../api/client'
import { ApiError, type Modality } from '../api/types'
import { FaceCapture } from '../components/FaceCapture'
import { FingerprintCapture } from '../components/FingerprintCapture'
import { VoiceCapture } from '../components/VoiceCapture'
import { getBuilding } from '../config/buildings'
import { useSession } from '../context/SessionContext'
import { useReducedMotion } from '../hooks/useReducedMotion'

const APPLICATION_ID = 'biometric-dashboard'

type Phase = 'capturing' | 'enrolling' | 'verifying' | 'error'

interface Captured {
  blob: Blob
  filename: string
}

export function AuthenticationFlowPage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const location = useLocation() as { state?: { modalities?: Modality[] } }
  const navigate = useNavigate()
  const { userId, recordAttempt } = useSession()
  const building = buildingId ? getBuilding(buildingId) : undefined
  const modalities = location.state?.modalities ?? building?.requiredModalities ?? []

  const [captured, setCaptured] = useState<Partial<Record<Modality, Captured>>>({})
  const [phase, setPhase] = useState<Phase>('capturing')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const reducedMotion = useReducedMotion()

  if (!building || modalities.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-text-muted">No verification factors selected.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-accent hover:underline">
          Back to facility list
        </Link>
      </div>
    )
  }

  const allCaptured = modalities.every((modality) => captured[modality])

  const handleCapture = (modality: Modality) => (blob: Blob, filename: string) => {
    setCaptured((prev) => ({ ...prev, [modality]: { blob, filename } }))
  }

  const handleSubmit = async () => {
    setErrorMessage(null)
    const startedAt = performance.now()
    try {
      setPhase('enrolling')
      setStatusMessage('Checking enrollment status...')
      const user = await getUser(userId)
      const alreadyEnrolled = new Set(user?.enrolled_modalities.map((m) => m.modality) ?? [])

      for (const modality of modalities) {
        if (alreadyEnrolled.has(modality)) continue
        const sample = captured[modality]!
        setStatusMessage(`Enrolling ${modality} (first use)...`)
        await enroll(modality, userId, APPLICATION_ID, sample.blob, sample.filename)
      }

      setPhase('verifying')
      setStatusMessage('Verifying against the fused biometric decision...')
      const samples: FusionSample[] = modalities.map((modality) => ({
        modality,
        sample: captured[modality]!.blob,
        filename: captured[modality]!.filename,
      }))
      const result = await authenticateFusion(userId, APPLICATION_ID, samples)
      const latencyMs = Math.round(performance.now() - startedAt)

      recordAttempt({
        buildingId: building.id,
        modalitiesUsed: result.modalities_used,
        fusedScore: result.fused_score,
        fusionThreshold: result.fusion_threshold,
        authenticated: result.authenticated,
        latencyMs,
        perModality: result.results,
      })

      navigate(`/building/${building.id}/result`, { state: { result, latencyMs } })
    } catch (error) {
      setPhase('error')
      setErrorMessage(error instanceof ApiError ? error.detail : 'The backend is unreachable. Is uvicorn running?')
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <p className="mb-2 font-mono text-xs tracking-[0.2em] text-accent uppercase">{building.name}</p>
      <h1 className="mb-8 text-xl font-semibold text-text">Capture verification samples</h1>

      <div className="relative mb-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {modalities.includes('face') && (
            <FaceCapture onCapture={handleCapture('face')} disabled={phase !== 'capturing'} />
          )}
          {modalities.includes('fingerprint') && (
            <FingerprintCapture onCapture={handleCapture('fingerprint')} disabled={phase !== 'capturing'} />
          )}
          {modalities.includes('voice') && (
            <VoiceCapture onCapture={handleCapture('voice')} disabled={phase !== 'capturing'} />
          )}
        </div>

        <AnimatePresence>
          {(phase === 'enrolling' || phase === 'verifying') && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-lg bg-void/85 backdrop-blur-sm"
            >
              <motion.div
                animate={reducedMotion ? undefined : { rotate: 360 }}
                transition={reducedMotion ? undefined : { duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <ScanLine className="h-10 w-10 text-accent" />
              </motion.div>
              <motion.p
                key={statusMessage}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-mono text-xs tracking-wide text-accent uppercase"
              >
                {statusMessage}
              </motion.p>
              <div className="h-0.5 w-48 overflow-hidden rounded-full bg-border">
                <motion.div
                  className="h-full w-1/3 bg-accent"
                  animate={reducedMotion ? undefined : { x: ['-100%', '300%'] }}
                  transition={reducedMotion ? undefined : { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </motion.div>
      )}

      <motion.button
        onClick={handleSubmit}
        disabled={!allCaptured || (phase !== 'capturing' && phase !== 'error')}
        whileHover={allCaptured && (phase === 'capturing' || phase === 'error') ? { scale: 1.01 } : undefined}
        whileTap={allCaptured && (phase === 'capturing' || phase === 'error') ? { scale: 0.98 } : undefined}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-accent py-3 font-mono text-sm tracking-wide text-void uppercase transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {phase === 'enrolling' || phase === 'verifying'
          ? 'Processing...'
          : `Submit ${modalities.length} sample${modalities.length === 1 ? '' : 's'}`}
      </motion.button>
    </div>
  )
}
