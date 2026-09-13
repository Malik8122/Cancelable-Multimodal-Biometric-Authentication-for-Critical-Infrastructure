import { Check, KeyRound, Lock, ShieldOff } from 'lucide-react'

// Only claims what's actually true of this codebase - see
// template_protection/ and docs/PRIVACY_AND_SECURITY.md. No new claims are
// made here that aren't already enforced server-side.
const CLAIMS = [
  { icon: ShieldOff, label: 'Raw images/audio stored', answer: 'NO' },
  { icon: ShieldOff, label: 'Embeddings stored', answer: 'NO' },
  { icon: Lock, label: 'Cancelable, protected templates only', answer: 'YES' },
  { icon: KeyRound, label: 'Revocable via key rotation', answer: 'YES' },
]

export function PrivacyCard({ templateVersion, keyVersion }: { templateVersion?: number; keyVersion?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5">
      <p className="mb-3 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Privacy guarantees</p>
      <ul className="space-y-2.5">
        {CLAIMS.map((claim) => (
          <li key={claim.label} className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 shrink-0 text-success" />
            <span>
              {claim.label}: <span className="text-success">{claim.answer}</span>
            </span>
          </li>
        ))}
      </ul>
      {(templateVersion !== undefined || keyVersion !== undefined) && (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 font-mono text-[10px]">
          <div>
            <p className="text-muted-foreground uppercase">Template version</p>
            <p className="text-foreground">{templateVersion ?? '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground uppercase">Key version</p>
            <p className="text-foreground">{keyVersion ?? '-'}</p>
          </div>
        </div>
      )}
    </div>
  )
}
