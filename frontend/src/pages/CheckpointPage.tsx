import { motion } from 'motion/react'
import { Link, useParams } from 'react-router-dom'
import { ClearanceBadge } from '../components/biometric/ClearanceBadge'
import { getBuilding } from '../config/buildings'

// Screen 2 - Security Lobby. Minimal, premium, one action at a time: the
// visitor has just walked through the entrance and is standing in front of
// the verification terminal. Nothing else competes for attention here.
export function CheckpointPage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const building = buildingId ? getBuilding(buildingId) : undefined

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

  return (
    <div className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 38%, rgba(91,141,239,0.08), transparent 70%)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative mb-10 flex flex-col items-center gap-2 text-center"
      >
        <span className="text-xs font-medium tracking-wide text-muted-foreground">{building.name}</span>
        <ClearanceBadge level={building.clearanceLevel} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15 }}
        className="relative mb-14 max-w-lg text-center"
      >
        <h1 className="mb-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Access Verification Terminal
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          This facility requires biometric identity verification.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
        className="relative flex flex-col gap-4 sm:flex-row"
      >
        <Link
          to={`/building/${building.id}/register`}
          className="rounded-xl bg-primary px-10 py-3.5 text-center text-sm font-medium text-primary-foreground shadow-lg shadow-black/20 transition-transform hover:scale-[1.02] active:scale-[0.99]"
        >
          Register Biometrics
        </Link>
        <Link
          to={`/building/${building.id}/authenticate`}
          className="rounded-xl border border-border px-10 py-3.5 text-center text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-white/[0.03]"
        >
          Authenticate Identity
        </Link>
      </motion.div>
    </div>
  )
}
