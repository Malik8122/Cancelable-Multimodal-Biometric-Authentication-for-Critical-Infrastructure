import { motion } from 'motion/react'
import { Fingerprint, Mic, ScanFace, ScanLine, UserPlus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ClearanceBadge } from '../components/biometric/ClearanceBadge'
import { getBuilding } from '../config/buildings'
import type { Modality } from '../api/types'

const MODALITY_ICON: Record<Modality, typeof ScanFace> = {
  face: ScanFace,
  fingerprint: Fingerprint,
  voice: Mic,
  iris: ScanFace,
}

export function CheckpointPage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const building = buildingId ? getBuilding(buildingId) : undefined

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

  return (
    <div className="relative mx-auto max-w-4xl px-6 py-16">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-20 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />

      <div className="mb-10 text-center">
        <p className="mb-2 font-mono text-xs tracking-[0.25em] text-primary uppercase">Access Verification Terminal</p>
        <h1 className="mb-2 text-2xl font-semibold text-foreground sm:text-3xl">{building.name}</h1>
        <div className="mb-3 flex justify-center">
          <ClearanceBadge level={building.clearanceLevel} />
        </div>
        <p className="mx-auto max-w-xl text-sm text-muted-foreground">{building.description}</p>

        <div className="mt-5 flex justify-center gap-3">
          {building.requiredModalities.map((modality) => {
            const Icon = MODALITY_ICON[modality]
            return (
              <div key={modality} className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1">
                <Icon className="h-3 w-3 text-primary" />
                <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">{modality}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <motion.div whileHover={{ y: -4 }}>
          <Link
            to={`/building/${building.id}/register`}
            className="group flex h-full flex-col items-center gap-4 rounded-2xl border border-border bg-card/60 p-8 text-center transition-colors hover:border-primary/50"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 transition-transform group-hover:scale-110">
              <UserPlus className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="mb-1.5 text-lg font-semibold text-foreground">Register Biometrics</h2>
              <p className="text-sm text-muted-foreground">First-time enrollment. Capture and protect new biometric credentials.</p>
            </div>
          </Link>
        </motion.div>

        <motion.div whileHover={{ y: -4 }}>
          <Link
            to={`/building/${building.id}/authenticate`}
            className="group flex h-full flex-col items-center gap-4 rounded-2xl border border-border bg-card/60 p-8 text-center transition-colors hover:border-primary/50"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 transition-transform group-hover:scale-110">
              <ScanLine className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="mb-1.5 text-lg font-semibold text-foreground">Authenticate Access</h2>
              <p className="text-sm text-muted-foreground">Already enrolled. Verify your identity against your protected template.</p>
            </div>
          </Link>
        </motion.div>
      </div>
    </div>
  )
}
