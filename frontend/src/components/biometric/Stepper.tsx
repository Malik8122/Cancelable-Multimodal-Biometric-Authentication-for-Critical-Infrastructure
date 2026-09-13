import { Check } from 'lucide-react'

export interface StepperProps {
  steps: string[]
  currentIndex: number
}

/** A horizontal pipeline stepper - shared by RegisterPage and
 * AuthenticatePage's processing view so "where am I in the pipeline" always
 * looks and behaves the same way. `aria-current` marks the active step for
 * screen readers, not just color. */
export function Stepper({ steps, currentIndex }: StepperProps) {
  return (
    <ol className="flex flex-wrap items-center justify-center gap-2" aria-label="Pipeline progress">
      {steps.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            aria-current={i === currentIndex ? 'step' : undefined}
            className={`flex h-7 items-center rounded-full border px-3 font-mono text-[9px] tracking-wider uppercase transition-colors ${
              i < currentIndex
                ? 'border-success/40 bg-success/10 text-success'
                : i === currentIndex
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground'
            }`}
          >
            {i < currentIndex && <Check className="mr-1 h-2.5 w-2.5" aria-hidden="true" />}
            {label}
          </span>
          {i < steps.length - 1 && <span className="h-px w-4 bg-border" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  )
}
