import { AnimatePresence, motion } from 'motion/react'
import { Lock, ShieldCheck } from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'

export function AccessDecisionHero({ authenticated }: { authenticated: boolean }) {
  const reducedMotion = useReducedMotion()
  const Icon = authenticated ? ShieldCheck : Lock
  const colorClass = authenticated ? 'text-success' : 'text-danger'
  const ringClass = authenticated ? 'border-success/30' : 'border-danger/30'
  const bgClass = authenticated ? 'bg-success/10' : 'bg-danger/10'

  return (
    <div className="relative flex flex-col items-center overflow-hidden py-14">
      {/* Two door leaves that slide open for a granted decision, and stay
          shut for a denied one - the door itself is the status indicator,
          never relying on color alone. */}
      {!reducedMotion && (
        <>
          <motion.div
            className="absolute inset-y-0 left-0 z-10 w-1/2 border-r border-white/5 bg-card"
            initial={{ x: 0 }}
            animate={authenticated ? { x: '-100%' } : { x: 0 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.76, 0, 0.24, 1] }}
          />
          <motion.div
            className="absolute inset-y-0 right-0 z-10 w-1/2 border-l border-white/5 bg-card"
            initial={{ x: 0 }}
            animate={authenticated ? { x: '100%' } : { x: 0 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.76, 0, 0.24, 1] }}
          />
        </>
      )}

      <AnimatePresence>
        <motion.div
          key="flash"
          className={`pointer-events-none fixed inset-0 z-40 ${authenticated ? 'bg-success' : 'bg-danger'}`}
          initial={{ opacity: 0.18 }}
          animate={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0.25 : 0.8, ease: 'easeOut' }}
        />
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 20, delay: 0.25 }}
        className={`relative z-20 mb-6 flex h-28 w-28 items-center justify-center rounded-full border ${ringClass} ${bgClass}`}
      >
        <Icon className={`h-11 w-11 ${colorClass}`} strokeWidth={1.5} />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className={`relative z-20 text-3xl font-semibold tracking-tight sm:text-4xl ${colorClass}`}
      >
        {authenticated ? 'Access Granted' : 'Access Denied'}
      </motion.h1>
    </div>
  )
}
