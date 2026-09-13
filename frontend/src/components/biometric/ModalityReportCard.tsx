import { motion } from 'motion/react'
import { Fingerprint, Mic, ScanFace } from 'lucide-react'
import type { Modality, ModalityAuthenticationResult } from '../../api/types'
import { useCountUp } from '../../hooks/useCountUp'
import { GlowingEffect } from '../ui/glowing-effect'

const ICON: Record<Modality, typeof ScanFace> = {
  face: ScanFace,
  fingerprint: Fingerprint,
  voice: Mic,
  iris: ScanFace,
}

export function ModalityReportCard({
  modality,
  result,
  index = 0,
}: {
  modality: Modality
  result: ModalityAuthenticationResult
  index?: number
}) {
  const Icon = ICON[modality]
  const animatedScore = useCountUp(result.score)
  const percent = Math.round(animatedScore * 100)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 + index * 0.12, duration: 0.4 }}
      className="relative rounded-xl border border-border bg-card/60 p-5 backdrop-blur"
    >
      <GlowingEffect disabled={false} proximity={60} spread={24} borderWidth={1.5} />
      <div className="relative mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="font-mono text-xs tracking-[0.15em] uppercase">{modality}</span>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[9px] tracking-wider uppercase ${
            result.authenticated ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'
          }`}
        >
          {result.authenticated ? 'Match' : 'No Match'}
        </span>
      </div>

      <div className="relative mb-2 h-2 overflow-hidden rounded-full bg-muted">
        <motion.div
          className={`h-full rounded-full ${result.authenticated ? 'bg-success' : 'bg-danger'}`}
          initial={{ width: '0%' }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.8, delay: 0.5 + index * 0.12, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <dl className="relative grid grid-cols-2 gap-y-1.5 font-mono text-[10px] text-muted-foreground">
        <dt>Score</dt>
        <dd className="text-right text-foreground">{animatedScore.toFixed(4)}</dd>
        <dt>Threshold</dt>
        <dd className="text-right text-foreground">{result.threshold.toFixed(2)}</dd>
        <dt>Distance</dt>
        <dd className="text-right text-foreground">{result.distance.toFixed(4)}</dd>
        <dt>Template v.</dt>
        <dd className="text-right text-foreground">{result.template_version || '-'}</dd>
        <dt>Key v.</dt>
        <dd className="text-right text-foreground">{result.key_version || '-'}</dd>
      </dl>
    </motion.div>
  )
}
