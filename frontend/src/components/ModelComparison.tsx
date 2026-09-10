import type { Modality, ModalityMetricsResponse } from '../api/types'

const ROWS: Array<{ key: keyof ModalityMetricsResponse['metrics']; label: string; percent?: boolean }> = [
  { key: 'accuracy', label: 'Accuracy', percent: true },
  { key: 'eer', label: 'EER', percent: true },
  { key: 'auc', label: 'AUC' },
  { key: 'far', label: 'FAR', percent: true },
  { key: 'frr', label: 'FRR', percent: true },
]

export function ModelComparison({ metrics }: { metrics: Partial<Record<Modality, ModalityMetricsResponse>> }) {
  const modalities = (Object.keys(metrics) as Modality[]).filter((m) => metrics[m])

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-panel p-5">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border text-text-dim">
            <th className="py-2 pr-4 font-mono font-normal uppercase">Metric</th>
            {modalities.map((modality) => (
              <th key={modality} className="py-2 pr-4 font-mono font-normal text-accent uppercase">
                {modality}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ key, label, percent }) => (
            <tr key={key} className="border-b border-border/50">
              <td className="py-2 pr-4 font-mono text-text-dim uppercase">{label}</td>
              {modalities.map((modality) => {
                const value = metrics[modality]?.metrics[key]
                return (
                  <td key={modality} className="py-2 pr-4 font-mono text-text">
                    {value === undefined ? (
                      <span className="text-text-dim">-</span>
                    ) : percent ? (
                      `${(value * 100).toFixed(2)}%`
                    ) : (
                      value.toFixed(4)
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
