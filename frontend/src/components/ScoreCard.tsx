import { Fingerprint, Mic, ScanFace } from 'lucide-react'
import type { Modality, ModalityAuthenticationResult } from '../api/types'

const ICON: Record<Modality, typeof ScanFace> = {
  face: ScanFace,
  fingerprint: Fingerprint,
  voice: Mic,
  iris: ScanFace,
}

export function ScoreCard({ modality, result }: { modality: Modality; result: ModalityAuthenticationResult }) {
  const Icon = ICON[modality]
  const percent = Math.round(result.score * 100)

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
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
        <div
          className={`h-full rounded-full ${result.authenticated ? 'bg-success' : 'bg-danger'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] text-text-dim">
        <span>score {result.score.toFixed(4)}</span>
        <span>threshold {result.threshold.toFixed(2)}</span>
      </div>
    </div>
  )
}
