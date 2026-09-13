import { motion } from 'motion/react'
import { Fingerprint, Mic, ScanFace } from 'lucide-react'

const ICON: Record<'face' | 'fingerprint' | 'voice', typeof ScanFace> = {
  face: ScanFace,
  fingerprint: Fingerprint,
  voice: Mic,
}

const LABEL: Record<'face' | 'fingerprint' | 'voice', string> = {
  face: 'Face',
  fingerprint: 'Fingerprint',
  voice: 'Voice',
}

export function ModalityChip({
  modality,
  selected,
  onToggle,
  enrolled,
}: {
  modality: 'face' | 'fingerprint' | 'voice'
  selected: boolean
  onToggle: () => void
  enrolled?: boolean
}) {
  const Icon = ICON[modality]
  return (
    <motion.button
      onClick={onToggle}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.95 }}
      animate={selected ? { scale: [1, 1.05, 1] } : { scale: 1 }}
      transition={{ duration: 0.25 }}
      className={`flex flex-col items-center gap-2 rounded-xl border px-6 py-5 transition-colors ${
        selected
          ? 'border-primary bg-primary/10 text-primary shadow-[0_0_20px_color-mix(in_srgb,var(--color-primary)_25%,transparent)]'
          : 'border-border bg-card/60 text-muted-foreground hover:border-primary/40'
      }`}
    >
      <Icon className="h-7 w-7" />
      <span className="text-sm font-medium">{LABEL[modality]}</span>
      {enrolled !== undefined && (
        <span className="font-mono text-[9px] tracking-wide uppercase opacity-70">
          {enrolled ? 'enrolled' : 'not enrolled'}
        </span>
      )}
    </motion.button>
  )
}
