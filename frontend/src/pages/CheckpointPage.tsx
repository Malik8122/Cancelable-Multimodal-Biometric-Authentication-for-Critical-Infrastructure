import { motion } from 'motion/react'
import { AlertCircle, Fingerprint, Loader2, Mic, ScanFace } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import type { Modality } from '../api/types'
import { ClearanceBadge } from '../components/biometric/ClearanceBadge'
import { EnrollmentStatusPill } from '../components/biometric/EnrollmentStatusPill'
import { FACTORS, MODALITY_LABEL } from '../config/buildings'
import { useBuildings } from '../context/BuildingsContext'
import { useSession } from '../context/SessionContext'
import { useEnrollmentProfile } from '../hooks/useEnrollmentProfile'

const ICON: Partial<Record<Modality, typeof ScanFace>> = { face: ScanFace, fingerprint: Fingerprint, voice: Mic }

// Security lobby. The building is only the context of the session; WHICH biometric factors to use is the user's
// choice, from what they have enrolled. A facility prescribes no particular factor.
export function CheckpointPage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const { getBuilding, status: buildingsStatus } = useBuildings()
  const { userId, knownUsers, switchUser, registerNewUser } = useSession()
  const building = buildingId ? getBuilding(buildingId) : undefined
  const { statuses, enrolledList, error, loading } = useEnrollmentProfile(userId)

  if (!building) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-muted-foreground">{buildingsStatus === 'loading' ? 'Loading facility...' : 'Unknown facility.'}</p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Return to the campus
        </Link>
      </div>
    )
  }

  const canAuthenticate = enrolledList.length > 0

  return (
    <div className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-6 py-14">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 38%, rgba(91,141,239,0.08), transparent 70%)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative mb-8 flex flex-col items-center gap-2 text-center"
      >
        <span className="text-xs font-medium tracking-wide text-muted-foreground">{building.name}</span>
        <ClearanceBadge level={building.clearanceLevel} />
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Access Verification Terminal</h1>
        <p className="max-w-md text-sm text-muted-foreground">{building.description}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="relative mb-4 w-full max-w-md rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-xl"
      >
        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">Registered User</p>
        {knownUsers.length > 1 ? (
          <select
            value={userId}
            onChange={(e) => switchUser(e.target.value)}
            className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-foreground"
          >
            {knownUsers.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm font-medium text-foreground">{userId}</p>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15 }}
        className="relative w-full max-w-md rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-xl"
      >
        <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">Your Biometric Enrollment</p>
        <ul className="mb-5 space-y-2">
          {FACTORS.map((modality) => {
            const Icon = ICON[modality]!
            return (
              <li key={modality} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2.5 text-foreground">
                  <Icon className="h-4 w-4 text-primary" strokeWidth={1.5} />
                  {MODALITY_LABEL[modality]}
                </span>
                {loading ? <span className="text-xs text-muted-foreground">...</span> : <EnrollmentStatusPill status={statuses[modality]} />}
              </li>
            )
          })}
        </ul>

        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> Checking enrollment&hellip;
          </p>
        )}
        {error && (
          <p className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} /> {error}
          </p>
        )}
        {!loading && !error && canAuthenticate && (
          <p className="border-t border-border pt-4 text-sm text-muted-foreground">
            Select biometric factors for this authentication session.
          </p>
        )}
        {!loading && !error && !canAuthenticate && (
          <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} /> Enroll at least one biometric factor before authenticating.
          </p>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
        className="relative mt-8 flex flex-col items-center gap-3"
      >
        {canAuthenticate ? (
          <Link
            to={`/building/${building.id}/authenticate`}
            className="rounded-xl bg-primary px-10 py-3.5 text-center text-sm font-medium text-primary-foreground shadow-lg shadow-black/20 transition-transform hover:scale-[1.02] active:scale-[0.99]"
          >
            Begin Authentication
          </Link>
        ) : (
          <Link
            to={`/building/${building.id}/register`}
            className="rounded-xl bg-primary px-10 py-3.5 text-center text-sm font-medium text-primary-foreground shadow-lg shadow-black/20 transition-transform hover:scale-[1.02] active:scale-[0.99]"
          >
            Enroll Biometrics
          </Link>
        )}
        {canAuthenticate && (
          <Link to={`/building/${building.id}/register`} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
            Manage biometric enrollment
          </Link>
        )}
        {/* Always available, even with only one known user - a different person enrolling never
            overwrites this user's templates: it switches the active session to a brand-new
            user_id first (useAuthSession::registerNewUser), then goes to registration for it. */}
        <Link
          to={`/building/${building.id}/register`}
          onClick={() => registerNewUser()}
          className="text-xs font-medium text-primary transition-colors hover:underline"
        >
          + New Registration
        </Link>
      </motion.div>
    </div>
  )
}
