import type { AuthenticationDecision } from '../../api/types'
import { MODALITY_LABEL } from '../../config/buildings'

const POLICY_LABEL: Record<string, string> = {
  ALL_REQUIRED: 'All Required',
  AT_LEAST_TWO: 'At Least Two',
  WEIGHTED: 'Weighted',
}

function Rows({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="divide-y divide-border rounded-xl border border-border bg-card/60 backdrop-blur-xl">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between px-6 py-3.5 text-sm">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="font-medium text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

const listModalities = (modalities: AuthenticationDecision['matched_modalities']) =>
  modalities.length ? modalities.map((m) => MODALITY_LABEL[m]).join(', ') : 'None'

// ACCESS_GRANTED: the facility, the single fusion similarity and the active template set that matched.
// ACCESS_DENIED: every SUBMITTED modality was enrolled, but verification failed. No similarity is shown - a high number
// beside a denial would be misleading (one failed modality denies access however well the others matched) - only the
// reason and which of the presented factors did verify.
export function DecisionSummary({ result, buildingName }: { result: AuthenticationDecision; buildingName: string }) {
  if (result.authentication_state === 'ACCESS_GRANTED') {
    return (
      <Rows
        items={[
          { label: 'Building', value: buildingName },
          { label: 'Fusion Similarity', value: result.fusion_similarity.toFixed(3) },
          { label: 'Matched Modalities', value: listModalities(result.matched_modalities) },
          { label: 'Active Template Set', value: `Set ${result.active_template_set}` },
          { label: 'Fusion Policy', value: POLICY_LABEL[result.fusion_policy] ?? result.fusion_policy },
          { label: 'Authentication Time', value: `${(result.authentication_time_ms / 1000).toFixed(2)} s` },
        ]}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-5 text-center">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">Reason</p>
        <p className="mt-1 text-sm font-medium text-danger">Biometric verification failed for one or more selected factors.</p>
      </div>
      <Rows
        items={[
          { label: 'Building', value: buildingName },
          { label: 'Presented Factors', value: listModalities(result.modalities_used) },
          { label: 'Verified Factors', value: listModalities(result.matched_modalities) },
        ]}
      />
    </div>
  )
}
