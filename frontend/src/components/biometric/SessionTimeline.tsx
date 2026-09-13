import { motion } from 'motion/react'
import { Camera, Check, Layers, Lock, ScanEye, ShieldCheck, ShieldX } from 'lucide-react'

// The backend returns one total latency per /authenticate/fusion call (see
// backend/api/fusion.py) - it does not expose a per-stage timing breakdown,
// so this timeline illustrates the real pipeline stages honestly without
// attaching a fabricated millisecond number to each one. Only the final
// total latency (real, from the actual response) is shown.
export function SessionTimeline({ authenticated, latencyMs }: { authenticated: boolean; latencyMs: number }) {
  const stages = [
    { key: 'capture', label: 'Capture', icon: Camera },
    { key: 'embedding', label: 'Embedding', icon: ScanEye },
    { key: 'biohash', label: 'BioHash', icon: Lock },
    { key: 'fusion', label: 'Fusion', icon: Layers },
    {
      key: 'decision',
      label: authenticated ? 'Granted' : 'Denied',
      icon: authenticated ? ShieldCheck : ShieldX,
      final: true,
    },
  ]

  return (
    <div className="flex items-center justify-between overflow-x-auto py-2">
      {stages.map((stage, i) => (
        <div key={stage.key} className="flex items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 * i }}
            className="flex flex-col items-center gap-1.5"
          >
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full border ${
                stage.final
                  ? authenticated
                    ? 'border-success bg-success/10 text-success'
                    : 'border-danger bg-danger/10 text-danger'
                  : 'border-primary/40 bg-primary/10 text-primary'
              }`}
            >
              {stage.final ? <stage.icon className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            </div>
            <span className="font-mono text-[9px] tracking-wide whitespace-nowrap text-muted-foreground uppercase">
              {stage.label}
            </span>
            {stage.final && (
              <span className="font-mono text-[9px] whitespace-nowrap text-muted-foreground/70">{latencyMs}ms total</span>
            )}
          </motion.div>
          {i < stages.length - 1 && <div className="mx-2 h-px w-8 shrink-0 bg-border sm:w-12" />}
        </div>
      ))}
    </div>
  )
}
