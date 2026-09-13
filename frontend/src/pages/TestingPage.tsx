import { CheckCircle2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getMetrics } from '../api/client'
import type { Modality, ModalityMetricsResponse } from '../api/types'
import { MetricBarChart } from '../components/testing/MetricBarChart'
import { MetricCounterCard } from '../components/testing/MetricCounterCard'
import { TerminalConsole } from '../components/testing/TerminalConsole'
import { useSession } from '../context/SessionContext'

const MODALITIES: Modality[] = ['face', 'fingerprint', 'voice', 'iris']

export function TestingPage() {
  const { health } = useSession()
  const [metrics, setMetrics] = useState<Partial<Record<Modality, ModalityMetricsResponse>>>({})

  useEffect(() => {
    MODALITIES.forEach((modality) => {
      getMetrics(modality)
        .then((result) => setMetrics((prev) => ({ ...prev, [modality]: result })))
        .catch(() => {})
    })
  }, [])

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <p className="mb-2 font-mono text-xs tracking-[0.25em] text-primary uppercase">ML Evaluation Dashboard</p>
      <h1 className="mb-8 text-2xl font-semibold text-foreground">Model Testing &amp; Live Backend Verification</h1>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">Live API Health</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HealthChip label="Connected" ok={!!health && health.backend === 'online'} />
          <HealthChip label="Database" ok={!!health && health.database === 'connected'} />
          <HealthChip label="Models" ok={!!health && [health.face_model, health.fingerprint_model, health.voice_model].every((m) => m === 'loaded')} />
          <HealthChip label="Threshold Calibration" ok={!!health?.thresholds_loaded} warn />
          <HealthChip label="Fusion Policy" ok value={health?.fusion_policy} />
          <HealthChip label="Audit Logging" ok={!!health?.audit_logging} />
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">Performance Cards</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODALITIES.map((modality) =>
            metrics[modality] ? (
              <MetricCounterCard key={modality} modality={modality} metrics={metrics[modality]!} />
            ) : (
              <div key={modality} className="rounded-xl border border-border bg-card/60 p-5 text-xs text-muted-foreground">
                Loading {modality}...
              </div>
            ),
          )}
        </div>
      </section>

      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricBarChart title="Accuracy" metricKey="accuracy" metrics={metrics} />
        <MetricBarChart title="Equal Error Rate" metricKey="eer" metrics={metrics} />
        <MetricBarChart title="ROC-AUC" metricKey="auc" metrics={metrics} percent={false} />
      </section>

      <section>
        <h2 className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">Run Test Cases</h2>
        <TerminalConsole />
      </section>
    </div>
  )
}

function HealthChip({ label, ok, warn, value }: { label: string; ok: boolean; warn?: boolean; value?: string }) {
  const Icon = ok ? CheckCircle2 : XCircle
  const colorClass = ok ? 'text-success' : warn ? 'text-warning' : 'text-danger'
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2.5">
      <Icon className={`h-4 w-4 shrink-0 ${colorClass}`} />
      <div className="min-w-0">
        <p className="truncate font-mono text-[9px] tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className={`truncate font-mono text-[11px] font-medium uppercase ${colorClass}`}>{value ?? (ok ? 'ok' : 'not ready')}</p>
      </div>
    </div>
  )
}
