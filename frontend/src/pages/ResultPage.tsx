import { motion } from 'framer-motion'
import { Link, useLocation, useParams } from 'react-router-dom'
import type { FusionAuthenticateResponse, Modality } from '../api/types'
import { AuthenticationLog } from '../components/AuthenticationLog'
import { FusionResult } from '../components/FusionResult'
import { PrivacyIndicator } from '../components/PrivacyIndicator'
import { ScoreCard } from '../components/ScoreCard'
import { getBuilding } from '../config/buildings'
import { useSession } from '../context/SessionContext'
import { useReducedMotion } from '../hooks/useReducedMotion'

export function ResultPage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const location = useLocation() as { state?: { result?: FusionAuthenticateResponse; latencyMs?: number } }
  const { log } = useSession()
  const building = buildingId ? getBuilding(buildingId) : undefined
  const result = location.state?.result
  const reducedMotion = useReducedMotion()

  if (!building || !result) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-text-muted">No authentication result to show.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-accent hover:underline">
          Back to facility list
        </Link>
      </div>
    )
  }

  const buildingLog = log.filter((entry) => entry.buildingId === building.id)
  const tailDelay = reducedMotion ? 0 : 0.9

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className="mb-8 font-mono text-xs tracking-[0.2em] text-accent uppercase">{building.name}</p>

      <FusionResult result={result} />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(Object.entries(result.results) as [Modality, (typeof result.results)[Modality]][]).map(
          ([modality, modalityResult], index) =>
            modalityResult && (
              <ScoreCard key={modality} modality={modality} result={modalityResult} index={index} />
            ),
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: tailDelay, duration: 0.4 }}
        className="mb-8 flex gap-3"
      >
        <Link
          to={`/building/${building.id}`}
          className="flex-1 scale-100 rounded-md border border-border py-2.5 text-center font-mono text-xs tracking-wide text-text-muted uppercase transition-all hover:scale-[1.02] hover:border-border-bright hover:text-text active:scale-[0.98]"
        >
          Try again
        </Link>
        <Link
          to="/"
          className="flex-1 scale-100 rounded-md border border-border py-2.5 text-center font-mono text-xs tracking-wide text-text-muted uppercase transition-all hover:scale-[1.02] hover:border-border-bright hover:text-text active:scale-[0.98]"
        >
          Facility list
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: tailDelay + 0.1, duration: 0.4 }}
        className="mb-6 rounded-lg border border-border bg-panel p-4"
      >
        <p className="mb-3 font-mono text-[10px] tracking-wider text-text-dim uppercase">
          Security audit - this facility (session log)
        </p>
        <AuthenticationLog entries={buildingLog} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: tailDelay + 0.2, duration: 0.4 }}>
        <PrivacyIndicator />
      </motion.div>
    </div>
  )
}
