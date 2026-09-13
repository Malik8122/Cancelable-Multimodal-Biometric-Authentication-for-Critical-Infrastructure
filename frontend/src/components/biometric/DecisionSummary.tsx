import type { FusionAuthenticateResponse } from '../../api/types'

// Screen 7's closing summary: exactly the fusion decision plus the two
// version numbers that matter for a protected-template system - no fused
// score gauge, no chart, nothing decorative.
export function DecisionSummary({ result }: { result: FusionAuthenticateResponse }) {
  const anyResult = Object.values(result.results).find(Boolean)

  const items = [
    {
      label: 'Fusion Decision',
      value: result.authenticated ? 'Granted' : 'Denied',
      valueClass: result.authenticated ? 'text-success' : 'text-danger',
    },
    { label: 'Template Version', value: anyResult?.template_version !== undefined ? `v${anyResult.template_version}` : '-' },
    { label: 'Key Version', value: anyResult?.key_version !== undefined ? `v${anyResult.key_version}` : '-' },
  ]

  return (
    <div className="grid grid-cols-1 divide-y divide-border rounded-xl border border-border bg-card/60 backdrop-blur-xl sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="px-6 py-5 text-center">
          <p className="mb-1.5 text-xs text-muted-foreground">{item.label}</p>
          <p className={`text-lg font-medium ${item.valueClass ?? 'text-foreground'}`}>{item.value}</p>
        </div>
      ))}
    </div>
  )
}
