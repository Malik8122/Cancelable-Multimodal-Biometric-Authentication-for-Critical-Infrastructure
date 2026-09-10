import { motion } from 'framer-motion'
import { Lock, ShieldCheck } from 'lucide-react'
import type { FusionAuthenticateResponse } from '../api/types'
import { useReducedMotion } from '../hooks/useReducedMotion'

export function FusionResult({ result }: { result: FusionAuthenticateResponse }) {
  const reducedMotion = useReducedMotion()
  const granted = result.authenticated
  const Icon = granted ? ShieldCheck : Lock
  const accentClass = granted ? 'text-success' : 'text-danger'
  const ringClass = granted ? 'border-success/40' : 'border-danger/40'

  return (
    <div className="flex flex-col items-center py-10">
      <div className={`relative mb-6 flex h-32 w-32 items-center justify-center rounded-full border-2 ${ringClass}`}>
        {!reducedMotion && (
          <motion.div
            className={`absolute inset-0 rounded-full border-2 ${ringClass}`}
            animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <Icon className={`h-14 w-14 ${accentClass}`} />
      </div>
      <h2 className={`mb-1 text-2xl font-semibold tracking-wide uppercase ${accentClass}`}>
        {granted ? 'Access Granted' : 'Access Denied'}
      </h2>
      <p className="font-mono text-xs text-text-dim">
        fused score {result.fused_score.toFixed(4)} / threshold {result.fusion_threshold.toFixed(2)}
      </p>
    </div>
  )
}
