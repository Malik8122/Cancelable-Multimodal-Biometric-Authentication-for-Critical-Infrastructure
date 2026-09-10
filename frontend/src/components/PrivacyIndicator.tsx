import { Check } from 'lucide-react'

// Only claims what's actually true of this codebase - see
// template_protection/ and docs/PRIVACY_AND_SECURITY.md. `answer` is the
// literal fact (YES/NO); every one of these facts is the privacy-favorable
// outcome by construction, so all four always render as a green checkmark -
// there is no "failing" state to flag here.
const CLAIMS: { label: string; answer: 'YES' | 'NO' }[] = [
  { label: 'Raw images/audio stored', answer: 'NO' },
  { label: 'Embeddings stored', answer: 'NO' },
  { label: 'Cancelable, protected templates only', answer: 'YES' },
  { label: 'Revocable (key rotation)', answer: 'YES' },
]

export function PrivacyIndicator() {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <p className="mb-3 font-mono text-[10px] tracking-wider text-text-dim uppercase">Privacy guarantees</p>
      <ul className="space-y-2">
        {CLAIMS.map((claim) => (
          <li key={claim.label} className="flex items-center gap-2 text-xs text-text-muted">
            <Check className="h-3.5 w-3.5 shrink-0 text-success" />
            <span>
              {claim.label}: <span className="text-success">{claim.answer}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
