import { motion } from 'framer-motion'
import { Building2, Fingerprint, Mic, ScanFace } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Building } from '../config/buildings'
import type { Modality } from '../api/types'

const MODALITY_ICON: Record<Modality, typeof ScanFace> = {
  face: ScanFace,
  fingerprint: Fingerprint,
  voice: Mic,
  iris: ScanFace,
}

const CLEARANCE_STYLE: Record<Building['clearanceLevel'], string> = {
  Standard: 'text-accent border-accent/40 bg-accent/10',
  Elevated: 'text-warning border-warning/40 bg-warning/10',
  Critical: 'text-danger border-danger/40 bg-danger/10',
}

export function BuildingCard({ building, index }: { building: Building; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
    >
      <Link
        to={`/building/${building.id}`}
        className="group block rounded-lg border border-border bg-panel p-6 transition-colors hover:border-accent/50 hover:bg-panel-raised"
      >
        <div className="mb-4 flex items-start justify-between">
          <Building2 className="h-6 w-6 text-text-muted transition-colors group-hover:text-accent" />
          <span
            className={`rounded border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${CLEARANCE_STYLE[building.clearanceLevel]}`}
          >
            {building.clearanceLevel}
          </span>
        </div>
        <h3 className="mb-1 text-base font-medium text-text">{building.name}</h3>
        <p className="mb-4 text-sm text-text-muted">{building.description}</p>
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <span className="font-mono text-[10px] tracking-wider text-text-dim uppercase">Requires</span>
          <div className="flex gap-2">
            {building.requiredModalities.map((modality) => {
              const Icon = MODALITY_ICON[modality]
              return <Icon key={modality} className="h-3.5 w-3.5 text-text-muted" />
            })}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
