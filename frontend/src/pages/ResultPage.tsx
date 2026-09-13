import { motion } from 'motion/react'
import { Link, useLocation, useParams } from 'react-router-dom'
import type { FusionAuthenticateResponse, Modality } from '../api/types'
import { AccessDecisionHero } from '../components/biometric/AccessDecisionHero'
import { FusionCard } from '../components/biometric/FusionCard'
import { ModalityReportCard } from '../components/biometric/ModalityReportCard'
import { PrivacyCard } from '../components/biometric/PrivacyCard'
import { SessionTimeline } from '../components/biometric/SessionTimeline'
import { getBuilding } from '../config/buildings'
import { useReducedMotion } from '../hooks/useReducedMotion'

export function ResultPage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const location = useLocation() as { state?: { result?: FusionAuthenticateResponse; latencyMs?: number } }
  const building = buildingId ? getBuilding(buildingId) : undefined
  const result = location.state?.result
  const latencyMs = location.state?.latencyMs ?? 0
  const reducedMotion = useReducedMotion()

  if (!building || !result) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-muted-foreground">No authentication result to show.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Return to Security Operations Center
        </Link>
      </div>
    )
  }

  const modalityEntries = Object.entries(result.results) as [Modality, (typeof result.results)[Modality]][]
  const anyResult = modalityEntries[0]?.[1]
  const tailDelay = reducedMotion ? 0 : 1.0

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <p className="mb-4 text-center font-mono text-xs tracking-[0.25em] text-primary uppercase">{building.name}</p>

      <AccessDecisionHero authenticated={result.authenticated} />

      <div className="mb-8 rounded-xl border border-border bg-card/40 p-4">
        <p className="mb-2 text-center font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          Session Timeline
        </p>
        <SessionTimeline authenticated={result.authenticated} latencyMs={latencyMs} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {modalityEntries.map(([modality, modalityResult], index) =>
          modalityResult ? <ModalityReportCard key={modality} modality={modality} result={modalityResult} index={index} /> : null,
        )}
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: tailDelay }} className="mb-6">
        <FusionCard result={result} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: tailDelay + 0.1 }}
        className="mb-6 flex gap-3"
      >
        <Link
          to={`/building/${building.id}/authenticate`}
          className="flex-1 rounded-lg border border-border py-2.5 text-center font-mono text-xs tracking-wide text-muted-foreground uppercase transition-all hover:scale-[1.01] hover:border-primary/50 hover:text-foreground"
        >
          Try Again
        </Link>
        <Link
          to="/"
          className="flex-1 rounded-lg border border-border py-2.5 text-center font-mono text-xs tracking-wide text-muted-foreground uppercase transition-all hover:scale-[1.01] hover:border-primary/50 hover:text-foreground"
        >
          Command Center
        </Link>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: tailDelay + 0.2 }}>
        <PrivacyCard templateVersion={anyResult?.template_version} keyVersion={anyResult?.key_version} />
      </motion.div>
    </div>
  )
}
