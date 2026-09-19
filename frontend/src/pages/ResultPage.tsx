import { motion } from 'motion/react'
import { UserPlus } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import type { AuthenticationOutcome } from '../api/types'
import { AccessDecisionHero } from '../components/biometric/AccessDecisionHero'
import { DecisionSummary } from '../components/biometric/DecisionSummary'
import { MODALITY_LABEL } from '../config/buildings'
import { useBuildings } from '../context/BuildingsContext'
import { useReducedMotion } from '../hooks/useReducedMotion'

const LINK_CLASS =
  'flex-1 rounded-xl border border-border py-3 text-center text-sm font-medium text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground'
const PRIMARY_CLASS =
  'flex-1 rounded-xl bg-primary py-3 text-center text-sm font-medium text-primary-foreground shadow-lg shadow-black/20 transition-opacity hover:opacity-90'

// One of exactly three states: ACCESS_GRANTED, ACCESS_DENIED, ENROLLMENT_REQUIRED. Enrollment-required is its own
// screen (no verdict animation, no similarity): a factor the user selected is not registered, so nothing was verified.
export function ResultPage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const location = useLocation() as { state?: { result?: AuthenticationOutcome } }
  const { getBuilding } = useBuildings()
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

  if (result.status === 'ENROLLMENT_REQUIRED') {
    const missing = result.missing_modalities
    const names = missing.map((m) => MODALITY_LABEL[m])
    const lower = names.map((n) => n.toLowerCase())
    return (
      <div className="mx-auto max-w-2xl px-6 pt-10 pb-32">
        <p className="mb-2 text-center text-xs font-medium tracking-wide text-muted-foreground">{building.name}</p>
        <div className="flex flex-col items-center py-12 text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-warning/30 bg-warning/10">
            <UserPlus className="h-10 w-10 text-warning" strokeWidth={1.5} />
          </div>
          <h1 className="mb-3 text-3xl font-semibold tracking-tight text-warning sm:text-4xl">Enrollment Required</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            You selected {names.join(' and ')}, which {missing.length === 1 ? 'is' : 'are'} not registered. Please complete{' '}
            {lower.join(' and ')} enrollment before requesting access with {missing.length === 1 ? 'it' : 'them'}.
          </p>
        </div>
        <div className="flex gap-3">
          <Link to={`/building/${building.id}/register?focus=${missing[0]}`} className={PRIMARY_CLASS}>
            Go to Enrollment
          </Link>
          <Link to={`/building/${building.id}/authenticate`} className={LINK_CLASS}>
            Choose Other Factors
          </Link>
        </div>
      </div>
    )
  }

  const granted = result.authentication_state === 'ACCESS_GRANTED'
  const tailDelay = reducedMotion ? 0 : 0.9

  return (
    <div className="mx-auto max-w-2xl px-6 pt-10 pb-32">
      <p className="mb-2 text-center text-xs font-medium tracking-wide text-muted-foreground">{building.name}</p>

      <AccessDecisionHero authenticated={granted} />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: tailDelay }} className="mb-8">
        <DecisionSummary result={result} buildingName={building.name} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: tailDelay + 0.1 }}
        className="flex gap-3"
      >
        <Link to={`/building/${building.id}/authenticate`} className={granted ? LINK_CLASS : PRIMARY_CLASS}>
          {granted ? 'Try Again' : 'Retry'}
        </Link>
        {granted && (
          <Link to="/templates" className={LINK_CLASS}>
            Manage Template Sets
          </Link>
        )}
        <Link to="/" className={LINK_CLASS}>
          Return to Campus
        </Link>
      </motion.div>
    </div>
  )
}
