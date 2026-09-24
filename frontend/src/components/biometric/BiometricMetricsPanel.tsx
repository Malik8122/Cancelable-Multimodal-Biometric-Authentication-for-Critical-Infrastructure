import { Check, X } from 'lucide-react'
import type { AuthenticationDecision, Modality } from '../../api/types'
import { MODALITY_LABEL } from '../../config/buildings'

const ORDER: Modality[] = ['face', 'voice', 'fingerprint']

// Scores are shown as percentages of the backend's higher-is-better similarity score (the same value fusion uses).
// For voice this is a similarity converted from the backend's distance estimate - never the raw distance.
// Negative similarities (unrelated samples) are shown as 0%.
const percent = (score: number) => `${(Math.min(1, Math.max(0, score)) * 100).toFixed(1)}%`

function Row({ label, score, pass }: { label: string; score: number; pass: boolean }) {
  return (
    <div className="flex items-center justify-between px-6 py-3.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`flex items-center gap-2 font-medium ${pass ? 'text-success' : 'text-danger'}`}>
        <span className="text-foreground">{percent(score)}</span>
        {pass ? <Check className="h-4 w-4" strokeWidth={2} aria-label="pass" /> : <X className="h-4 w-4" strokeWidth={2} aria-label="fail" />}
      </span>
    </div>
  )
}

// The user-facing result: one similarity per presented modality, the fusion score and the final decision.
// Per-modality scores arrive only when the backend runs with DEBUG_SCORES=true; without them only the fusion score
// (on success) and the decision are shown. Technical detail stays in the API response, backend logs and docs.
export function BiometricMetricsPanel({ result }: { result: AuthenticationDecision }) {
  const granted = result.authentication_state === 'ACCESS_GRANTED'
  const results = result.results ?? {}
  const present = ORDER.filter((m) => results[m])
  const showFusion = present.length > 0 || granted

  return (
    <div className="mb-6 divide-y divide-border rounded-xl border border-border bg-card/60 backdrop-blur-xl">
      {present.map((m) => (
        <Row key={m} label={`${MODALITY_LABEL[m]} Similarity`} score={results[m]!.score} pass={results[m]!.authenticated} />
      ))}
      {showFusion && (
        <Row label="Fusion Score" score={result.fusion_similarity} pass={result.fusion_similarity >= result.fusion_threshold} />
      )}
      <p className={`flex items-center justify-center gap-2 px-6 py-4 text-base font-semibold tracking-wide ${granted ? 'text-success' : 'text-danger'}`}>
        {granted ? <Check className="h-5 w-5" strokeWidth={2} /> : <X className="h-5 w-5" strokeWidth={2} />}
        {granted ? 'AUTHENTICATED' : 'ACCESS DENIED'}
      </p>
    </div>
  )
}
