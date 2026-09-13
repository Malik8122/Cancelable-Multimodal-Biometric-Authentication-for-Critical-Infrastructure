import { motion } from 'framer-motion'
import { Fingerprint, Mic, ScanFace } from 'lucide-react'
import type { Modality, ModalityAuthenticationResult } from '../api/types'
import { useCountUp } from '../hooks/useCountUp'
import { useReducedMotion } from '../hooks/useReducedMotion'

const ICON: Record<Modality, typeof ScanFace> = {
  face: ScanFace,
  fingerprint: Fingerprint,
  voice: Mic,
  iris: ScanFace,
}

export function ScoreCard({
  modality,
  result,
  index = 0,
}: {
  modality: Modality
  result: ModalityAuthenticationResult
  index?: number
}) {
  const Icon = ICON[modality]
  const reducedMotion = useReducedMotion()
  const animatedScore = useCountUp(result.score)
  const percent = Math.round(animatedScore * 100)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reducedMotion ? 0 : 0.5 + index * 0.12, duration: 0.4 }}
      className="rounded-lg border border-border bg-panel p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-text-muted">
          <Icon className="h-4 w-4" />
          <span className="font-mono text-xs tracking-wider uppercase">{modality}</span>
        </div>
        <span className={`font-mono text-[10px] tracking-wider uppercase ${result.authenticated ? 'text-success' : 'text-danger'}`}>
          {result.authenticated ? 'Match' : 'No match'}
        </span>
      </div>
      <div className="mb-1 h-2 overflow-hidden rounded-full bg-void">
        <motion.div
          className={`h-full rounded-full ${result.authenticated ? 'bg-success' : 'bg-danger'}`}
          initial={{ width: '0%' }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: reducedMotion ? 0 : 0.8, delay: reducedMotion ? 0 : 0.5 + index * 0.12, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] text-text-dim">
        <span>score {animatedScore.toFixed(4)}</span>
        <span>threshold {result.threshold.toFixed(2)}</span>
      </div>
    </motion.div>
  )
}
