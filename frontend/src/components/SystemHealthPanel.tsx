import { CheckCircle2, XCircle } from 'lucide-react'
import type { SystemHealthResponse } from '../api/types'

const ROWS: Array<{ key: keyof SystemHealthResponse; label: string }> = [
  { key: 'backend', label: 'Backend' },
  { key: 'database', label: 'Database' },
  { key: 'face_model', label: 'Face model' },
  { key: 'fingerprint_model', label: 'Fingerprint model' },
  { key: 'voice_model', label: 'Voice model' },
  { key: 'template_protection', label: 'Template protection' },
]

function isHealthy(value: string | boolean): boolean {
  if (typeof value === 'boolean') return value
  return value === 'online' || value === 'connected' || value === 'loaded' || value === 'active'
}

export function SystemHealthPanel({ health }: { health: SystemHealthResponse | null }) {
  if (!health) {
    return (
      <div className="rounded-lg border border-border bg-panel p-5 text-xs text-text-dim">
        GET /system/health unreachable.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ROWS.map(({ key, label }) => {
          const value = String(health[key])
          const healthy = isHealthy(health[key])
          return (
            <div key={key} className="flex items-center gap-2">
              {healthy ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-danger" />
              )}
              <div>
                <p className="font-mono text-[9px] tracking-wide text-text-dim uppercase">{label}</p>
                <p className="text-xs text-text">{value}</p>
              </div>
            </div>
          )
        })}
        <div className="flex items-center gap-2">
          {health.thresholds_loaded ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
          ) : (
            <XCircle className="h-3.5 w-3.5 shrink-0 text-warning" />
          )}
          <div>
            <p className="font-mono text-[9px] tracking-wide text-text-dim uppercase">Calibrated thresholds</p>
            <p className="text-xs text-text">{health.thresholds_loaded ? 'loaded' : 'using fallback default'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
          <div>
            <p className="font-mono text-[9px] tracking-wide text-text-dim uppercase">Fusion policy</p>
            <p className="text-xs text-text">{health.fusion_policy}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
