import { motion } from 'motion/react'
import type { Modality } from '../../api/types'
import { securityStrength } from '../../config/buildings'

const STRENGTH_META: Record<ReturnType<typeof securityStrength>, { color: string; fill: number }> = {
  None: { color: 'bg-muted', fill: 0 },
  Medium: { color: 'bg-warning', fill: 33 },
  High: { color: 'bg-primary', fill: 66 },
  Maximum: { color: 'bg-success', fill: 100 },
}

export function SecurityStrengthMeter({ modalities }: { modalities: Modality[] }) {
  const strength = securityStrength(modalities)
  const meta = STRENGTH_META[strength]

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          Authentication strength
        </span>
        <span className="font-mono text-xs font-semibold tracking-wide uppercase">{strength}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <motion.div
          className={`h-full rounded-full ${meta.color}`}
          initial={{ width: 0 }}
          animate={{ width: `${meta.fill}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  )
}
