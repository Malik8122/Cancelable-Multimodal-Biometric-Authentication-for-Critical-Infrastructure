import { motion } from 'motion/react'
import { Check, Fingerprint, Mic, ScanFace, X } from 'lucide-react'
import type { Modality, ModalityAuthenticationResult } from '../../api/types'
import { useCountUp } from '../../hooks/useCountUp'

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 + index * 0.12, duration: 0.5 }}
      className="rounded-xl border border-border bg-card/60 p-5 backdrop-blur-xl"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" strokeWidth={1.5} />
          <span className="text-sm font-medium capitalize">{modality}</span>
        </div>
        <span
          className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
            result.authenticated ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'
          }`}
        >
          {result.authenticated ? <Check className="h-3 w-3" strokeWidth={2} /> : <X className="h-3 w-3" strokeWidth={2} />}
          {result.authenticated ? 'Match' : 'No Match'}
        </span>
      </div>

      <dl className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Similarity Score</dt>
          <dd className="text-foreground">{animatedScore.toFixed(3)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Threshold</dt>
          <dd className="text-foreground">{result.threshold.toFixed(3)}</dd>
        </div>
      </dl>
    </motion.div>
  )
}
