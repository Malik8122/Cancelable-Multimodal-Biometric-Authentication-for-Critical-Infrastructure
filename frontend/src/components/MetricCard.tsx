import type { Modality, ModalityMetricsResponse } from '../api/types'

const FIELD_ORDER: Array<{ key: keyof ModalityMetricsResponse['metrics']; label: string; percent?: boolean }> = [
  { key: 'accuracy', label: 'Accuracy', percent: true },
  { key: 'eer', label: 'EER', percent: true },
  { key: 'auc', label: 'AUC' },
  { key: 'far', label: 'FAR', percent: true },
  { key: 'frr', label: 'FRR', percent: true },
  { key: 'precision', label: 'Precision', percent: true },
  { key: 'recall', label: 'Recall', percent: true },
  { key: 'f1', label: 'F1' },
  { key: 'num_samples', label: 'Samples' },
]

export function MetricCard({ modality, metrics }: { modality: Modality; metrics: ModalityMetricsResponse }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-5">
      <p className="mb-4 font-mono text-xs tracking-wider text-accent uppercase">{modality}</p>
      {!metrics.available ? (
        <p className="text-sm text-text-dim">Not evaluated yet.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {FIELD_ORDER.map(({ key, label, percent }) => {
            const value = metrics.metrics[key]
            return (
              <div key={key}>
                <dt className="font-mono text-[10px] text-text-dim uppercase">{label}</dt>
                <dd className="font-mono text-sm text-text">
                  {value === undefined
                    ? <span className="text-text-dim">Not evaluated yet</span>
                    : percent
                      ? `${(value * 100).toFixed(2)}%`
                      : key === 'num_samples'
                        ? value.toLocaleString()
                        : value.toFixed(4)}
                </dd>
              </div>
            )
          })}
        </dl>
      )}
    </div>
  )
}
