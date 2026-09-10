import { Link, useLocation, useParams } from 'react-router-dom'
import type { FusionAuthenticateResponse, Modality } from '../api/types'
import { AuthenticationLog } from '../components/AuthenticationLog'
import { FusionResult } from '../components/FusionResult'
import { PrivacyIndicator } from '../components/PrivacyIndicator'
import { ScoreCard } from '../components/ScoreCard'
import { getBuilding } from '../config/buildings'
import { useSession } from '../context/SessionContext'

export function ResultPage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const location = useLocation() as { state?: { result?: FusionAuthenticateResponse; latencyMs?: number } }
  const { log } = useSession()
  const building = buildingId ? getBuilding(buildingId) : undefined
  const result = location.state?.result

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

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className="mb-8 font-mono text-xs tracking-[0.2em] text-accent uppercase">{building.name}</p>

      <FusionResult result={result} />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(Object.entries(result.results) as [Modality, (typeof result.results)[Modality]][]).map(
          ([modality, modalityResult]) =>
            modalityResult && <ScoreCard key={modality} modality={modality} result={modalityResult} />,
        )}
      </div>

      <div className="mb-8 flex gap-3">
        <Link
          to={`/building/${building.id}`}
          className="flex-1 rounded-md border border-border py-2.5 text-center font-mono text-xs tracking-wide text-text-muted uppercase transition-colors hover:border-border-bright hover:text-text"
        >
          Try again
        </Link>
        <Link
          to="/"
          className="flex-1 rounded-md border border-border py-2.5 text-center font-mono text-xs tracking-wide text-text-muted uppercase transition-colors hover:border-border-bright hover:text-text"
        >
          Facility list
        </Link>
      </div>

      <div className="mb-6 rounded-lg border border-border bg-panel p-4">
        <p className="mb-3 font-mono text-[10px] tracking-wider text-text-dim uppercase">
          Security audit - this facility (session log)
        </p>
        <AuthenticationLog entries={buildingLog} />
      </div>

      <PrivacyIndicator />
    </div>
  )
}
