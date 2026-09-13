import { motion } from 'motion/react'
import { ShieldAlert } from 'lucide-react'
import type { Building } from '../../config/buildings'

const STYLE: Record<Building['clearanceLevel'], string> = {
  III: 'text-primary border-primary/40 bg-primary/10',
  IV: 'text-warning border-warning/40 bg-warning/10',
  V: 'text-danger border-danger/40 bg-danger/10',
}

export function ClearanceBadge({ level }: { level: Building['clearanceLevel'] }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-widest uppercase ${STYLE[level]}`}
    >
      <ShieldAlert className="h-3 w-3" />
      Clearance {level}
    </motion.span>
  )
}
