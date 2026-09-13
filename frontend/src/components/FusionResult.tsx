import { AnimatePresence, motion, type Variants } from 'framer-motion'
import { Lock, ShieldCheck } from 'lucide-react'
import type { FusionAuthenticateResponse } from '../api/types'
import { useReducedMotion } from '../hooks/useReducedMotion'

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
}

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
}

export function FusionResult({ result }: { result: FusionAuthenticateResponse }) {
  const reducedMotion = useReducedMotion()
  const granted = result.authenticated
  const Icon = granted ? ShieldCheck : Lock
  const accentClass = granted ? 'text-success' : 'text-danger'
  const ringClass = granted ? 'border-success/40' : 'border-danger/40'
  const flashClass = granted ? 'bg-success' : 'bg-danger'

  return (
    <>
      {/* One-shot full-viewport flash on mount - a decision landing, not a
          decorative loop, so it's a single fade-out and stays even with
          reduced motion (just a plain flash, no ring/stagger choreography). */}
      <AnimatePresence>
        <motion.div
          key="flash"
          className={`pointer-events-none fixed inset-0 z-40 ${flashClass}`}
          initial={{ opacity: 0.35 }}
          animate={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0.25 : 0.7, ease: 'easeOut' }}
        />
      </AnimatePresence>

      <motion.div
        className="flex flex-col items-center py-10"
        variants={reducedMotion ? undefined : container}
        initial={reducedMotion ? undefined : 'hidden'}
        animate={reducedMotion ? undefined : 'show'}
      >
        <motion.div
          variants={reducedMotion ? undefined : item}
          initial={reducedMotion ? undefined : { opacity: 0, scale: 0.6, rotate: -12 }}
          animate={reducedMotion ? undefined : { opacity: 1, scale: 1, rotate: 0 }}
          transition={reducedMotion ? undefined : { type: 'spring', stiffness: 260, damping: 18 }}
          className={`relative mb-6 flex h-32 w-32 items-center justify-center rounded-full border-2 ${ringClass}`}
        >
          {!reducedMotion &&
            [0, 0.5].map((delay) => (
              <motion.div
                key={delay}
                className={`absolute inset-0 rounded-full border-2 ${ringClass}`}
                animate={{ scale: [1, 1.45], opacity: [0.6, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay }}
              />
            ))}
          <Icon className={`h-14 w-14 ${accentClass}`} />
        </motion.div>

        <motion.h2
          variants={reducedMotion ? undefined : item}
          className={`mb-1 text-2xl font-semibold tracking-wide uppercase ${accentClass}`}
        >
          {granted ? 'Access Granted' : 'Access Denied'}
        </motion.h2>

        <motion.p variants={reducedMotion ? undefined : item} className="font-mono text-xs text-text-dim">
          fused score {result.fused_score.toFixed(4)} / threshold {result.fusion_threshold.toFixed(2)}
        </motion.p>
      </motion.div>
    </>
  )
}
