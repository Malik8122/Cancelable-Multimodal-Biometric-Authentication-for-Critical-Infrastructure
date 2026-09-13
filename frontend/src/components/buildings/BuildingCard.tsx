import { motion } from 'motion/react'
import { Fingerprint, Landmark, Mic, ScanFace } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Building } from '../../config/buildings'
import type { Modality } from '../../api/types'
import { ClearanceBadge } from '../biometric/ClearanceBadge'
import { GlowingEffect } from '../ui/glowing-effect'
import { WobbleCard } from '../ui/wobble-card'

const MODALITY_ICON: Record<Modality, typeof ScanFace> = {
  face: ScanFace,
  fingerprint: Fingerprint,
  voice: Mic,
  iris: ScanFace,
}

export function BuildingCard({ building, index }: { building: Building; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="relative"
    >
      <GlowingEffect disabled={false} proximity={100} spread={35} borderWidth={2} blur={2} />
      <Link to={`/building/${building.id}`} className="block">
        <WobbleCard containerClassName="border border-border bg-card min-h-[280px]" className="!py-8">
          {/* Oversized faded silhouette - building artwork stand-in */}
          <Landmark className="pointer-events-none absolute -right-6 -bottom-8 h-40 w-40 text-primary/[0.06] transition-colors duration-500 group-hover:text-primary/10" />

          <div className="relative z-10 flex h-full flex-col justify-between gap-6">
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                <Landmark className="h-5 w-5 text-primary" />
              </div>
              <ClearanceBadge level={building.clearanceLevel} />
            </div>

            <div>
              <h3 className="mb-1.5 text-lg font-semibold text-foreground">{building.name}</h3>
              <p className="text-sm text-muted-foreground">{building.description}</p>
            </div>

            <div className="flex items-center gap-2 border-t border-border/60 pt-4">
              <span className="font-mono text-[9px] tracking-wider text-muted-foreground/70 uppercase">Requires</span>
              <div className="flex gap-2">
                {building.requiredModalities.map((modality) => {
                  const Icon = MODALITY_ICON[modality]
                  return (
                    <div
                      key={modality}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-muted"
                    >
                      <Icon className="h-3 w-3 text-primary" />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </WobbleCard>
      </Link>
    </motion.div>
  )
}
