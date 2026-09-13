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
}: {
  modality: 'face' | 'fingerprint' | 'voice'
  selected: boolean
  onToggle: () => void
}) {
  const Icon = ICON[modality]
  return (
    <motion.button
      onClick={onToggle}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      className={`flex flex-col items-center gap-2.5 rounded-xl border px-6 py-6 transition-colors ${
        selected
          ? 'border-primary/60 bg-primary/10 text-primary'
          : 'border-border bg-card/60 text-muted-foreground hover:border-white/20'
      }`}
    >
      <Icon className="h-6 w-6" strokeWidth={1.5} />
      <span className="text-sm font-medium">{LABEL[modality]}</span>
    </motion.button>
  )
}
