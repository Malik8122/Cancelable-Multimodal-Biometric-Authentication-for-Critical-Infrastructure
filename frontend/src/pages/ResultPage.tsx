import { motion } from 'motion/react'
import { Link, useLocation, useParams } from 'react-router-dom'
import type { FusionAuthenticateResponse, Modality } from '../api/types'
import { AccessDecisionHero } from '../components/biometric/AccessDecisionHero'
import { DecisionSummary } from '../components/biometric/DecisionSummary'
import { ModalityReportCard } from '../components/biometric/ModalityReportCard'
import { getBuilding } from '../config/buildings'
import { useReducedMotion } from '../hooks/useReducedMotion'

export function ResultPage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const location = useLocation() as { state?: { result?: FusionAuthenticateResponse; latencyMs?: number } }
  const building = buildingId ? getBuilding(buildingId) : undefined
  const result = location.state?.result
  const reducedMotion = useReducedMotion()

  if (!building || !result) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-muted-foreground">No authentication result to show.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Return to the campus
        </Link>
      </div>
    )
  }

  const modalityEntries = Object.entries(result.results) as [Modality, (typeof result.results)[Modality]][]
  const tailDelay = reducedMotion ? 0 : 1.0

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="mb-2 text-center text-xs font-medium tracking-wide text-muted-foreground">{building.name}</p>

      <AccessDecisionHero authenticated={result.authenticated} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {modalityEntries.map(([modality, modalityResult], index) =>
          modalityResult ? <ModalityReportCard key={modality} modality={modality} result={modalityResult} index={index} /> : null,
        )}
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: tailDelay }} className="mb-8">
        <DecisionSummary result={result} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: tailDelay + 0.1 }}
        className="flex gap-3"
      >
        <Link
          to={`/building/${building.id}/authenticate`}
          className="flex-1 rounded-xl border border-border py-3 text-center text-sm font-medium text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground"
        >
          Try Again
        </Link>
        <Link
          to="/"
          className="flex-1 rounded-xl border border-border py-3 text-center text-sm font-medium text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground"
        >
          Return to Campus
        </Link>
      </motion.div>
    </div>
  )
}
