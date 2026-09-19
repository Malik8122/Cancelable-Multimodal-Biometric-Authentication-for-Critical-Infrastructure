import { motion } from 'motion/react'
import { Fingerprint, Mic, ScanFace } from 'lucide-react'
import type { Modality, TemplateSetStatus } from '../../api/types'

const STATUS_STYLE: Record<TemplateSetStatus, { badge: string; card: string }> = {
  ACTIVE: { badge: 'border-success/30 bg-success/10 text-success', card: 'border-success/30' },
  STANDBY: { badge: 'border-primary/30 bg-primary/10 text-primary', card: 'border-border' },
  REVOKED: { badge: 'border-danger/30 bg-danger/10 text-danger', card: 'border-border opacity-60' },
}

const MODALITY: Partial<Record<Modality, { label: string; icon: typeof ScanFace }>> = {
  face: { label: 'Face', icon: ScanFace },
  fingerprint: { label: 'Fingerprint', icon: Fingerprint },
  voice: { label: 'Voice', icon: Mic },
}

const MODALITY_ORDER: Modality[] = ['face', 'fingerprint', 'voice', 'iris']

export function StatusBadge({ status }: { status: TemplateSetStatus }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status].badge}`}>
      {status === 'ACTIVE' ? 'Active' : status === 'STANDBY' ? 'Standby' : 'Revoked'}
    </span>
  )
}

function formatTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '-'
}

export interface TemplateSetCardData {
  version: number
  status: TemplateSetStatus
  modalities: Modality[]
  created?: string | null
  activated?: string | null
  revoked?: string | null
}

// One template SET - a complete multimodal credential. Lists which modalities
// it contains (each as "<Modality> V<set version>") and its lifecycle times.
// Protected template values are never sent to the frontend.
export function TemplateSetCard({
  set,
  onActivate,
  busy,
}: {
  set: TemplateSetCardData
  onActivate?: () => void
  busy?: boolean
}) {
  const modalities = [...set.modalities].sort((a, b) => MODALITY_ORDER.indexOf(a) - MODALITY_ORDER.indexOf(b))
  return (
    <motion.div layout className={`rounded-xl border bg-card/60 p-4 backdrop-blur-xl ${STATUS_STYLE[set.status].card}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Template Set {set.version}</span>
        <StatusBadge status={set.status} />
      </div>

      <p className="mb-1.5 text-[11px] text-muted-foreground">Contains</p>
      <ul className="mb-3 space-y-1">
        {modalities.map((m) => {
          const meta = MODALITY[m]
          const Icon = meta?.icon ?? ScanFace
          return (
            <li key={m} className="flex items-center gap-2 text-xs text-foreground">
              <Icon className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
              {meta?.label ?? m} Template V{set.version}
            </li>
          )
        })}
      </ul>

      {(set.created !== undefined || set.activated !== undefined || set.revoked !== undefined) && (
        <dl className="space-y-1 border-t border-border pt-2.5 text-xs">
          {set.created !== undefined && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Created</dt>
              <dd className="text-right text-foreground">{formatTime(set.created)}</dd>
            </div>
          )}
          {set.activated !== undefined && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Activated</dt>
              <dd className="text-right text-foreground">{formatTime(set.activated)}</dd>
            </div>
          )}
          {set.revoked !== undefined && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Revoked</dt>
              <dd className="text-right text-foreground">{formatTime(set.revoked)}</dd>
            </div>
          )}
        </dl>
      )}

      {onActivate && set.status === 'STANDBY' && (
        <button
          onClick={onActivate}
          disabled={busy}
          className="mt-3 w-full rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground disabled:opacity-40"
        >
          Activate Set
        </button>
      )}
    </motion.div>
  )
}
