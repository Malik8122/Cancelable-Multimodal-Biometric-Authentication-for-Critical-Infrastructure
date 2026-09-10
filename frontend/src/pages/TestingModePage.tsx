import { useEffect, useState } from 'react'
import { getMetrics } from '../api/client'
import type { Modality, ModalityMetricsResponse } from '../api/types'
import { AuthenticationLog } from '../components/AuthenticationLog'
import { MetricCard } from '../components/MetricCard'
import { ModelComparison } from '../components/ModelComparison'
import { TestCaseTable } from '../components/TestCaseTable'
import { useSession } from '../context/SessionContext'

const MODALITIES: Modality[] = ['face', 'fingerprint', 'voice', 'iris']

export function TestingModePage() {
  const { log, clearLog } = useSession()
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
      <p className="mb-2 font-mono text-xs tracking-[0.2em] text-accent uppercase">Model Testing</p>
      <h1 className="mb-8 text-xl font-semibold text-text">Evaluation metrics &amp; live backend checks</h1>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-xs tracking-wider text-text-muted uppercase">Per-modality metrics</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODALITIES.map((modality) =>
            metrics[modality] ? (
              <MetricCard key={modality} modality={modality} metrics={metrics[modality]!} />
            ) : (
              <div key={modality} className="rounded-lg border border-border bg-panel p-5 text-xs text-text-dim">
                Loading {modality}...
              </div>
            ),
          )}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-xs tracking-wider text-text-muted uppercase">Model comparison</h2>
        <ModelComparison metrics={metrics} />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-xs tracking-wider text-text-muted uppercase">Test cases</h2>
        <TestCaseTable />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-xs tracking-wider text-text-muted uppercase">
            Performance log (this session)
          </h2>
          <button
            onClick={clearLog}
            className="rounded border border-border px-3 py-1 font-mono text-[10px] tracking-wide text-text-muted uppercase transition-colors hover:border-border-bright hover:text-text"
          >
            Clear
          </button>
        </div>
        <div className="rounded-lg border border-border bg-panel p-5">
          <AuthenticationLog entries={log} />
        </div>
      </section>
    </div>
  )
}
