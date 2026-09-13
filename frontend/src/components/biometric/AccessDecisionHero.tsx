import { AnimatePresence, motion } from 'motion/react'
import { Lock, ShieldCheck } from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'

export function AccessDecisionHero({ authenticated }: { authenticated: boolean }) {
  const reducedMotion = useReducedMotion()
  const Icon = authenticated ? ShieldCheck : Lock
  const colorClass = authenticated ? 'text-success' : 'text-danger'
  const ringClass = authenticated ? 'border-success/40' : 'border-danger/40'
  const flashClass = authenticated ? 'bg-success' : 'bg-danger'

  return (
    <div className="relative flex flex-col items-center overflow-hidden py-10">
      <AnimatePresence>
        <motion.div
          key="flash"
          className={`pointer-events-none fixed inset-0 z-40 ${flashClass}`}
          initial={{ opacity: 0.3 }}
          animate={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0.25 : 0.8, ease: 'easeOut' }}
        />
      </AnimatePresence>

      {/* Two door leaves that slide open for a granted decision */}
      {authenticated && !reducedMotion && (
        <>
          <motion.div
            className="absolute inset-y-0 left-0 z-10 w-1/2 bg-gradient-to-r from-background via-background to-transparent"
            initial={{ x: 0 }}
            animate={{ x: '-100%' }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.76, 0, 0.24, 1] }}
          />
          <motion.div
            className="absolute inset-y-0 right-0 z-10 w-1/2 bg-gradient-to-l from-background via-background to-transparent"
            initial={{ x: 0 }}
            animate={{ x: '100%' }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.76, 0, 0.24, 1] }}
          />
        </>
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.2 }}
        className={`relative z-20 mb-6 flex h-32 w-32 items-center justify-center rounded-full border-2 ${ringClass}`}
      >
        {[0, 0.5].map((delay) => (
          <motion.div
            key={delay}
            className={`absolute inset-0 rounded-full border-2 ${ringClass}`}
            animate={authenticated ? { scale: [1, 1.45], opacity: [0.6, 0] } : { scale: [1, 1.15, 1], opacity: [0.8, 0.4, 0.8] }}
            transition={{ duration: authenticated ? 1.8 : 1, repeat: Infinity, ease: authenticated ? 'easeOut' : 'easeInOut', delay }}
          />
        ))}
        <Icon className={`h-14 w-14 ${colorClass}`} />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className={`relative z-20 mb-1 text-3xl font-bold tracking-wide uppercase ${colorClass}`}
      >
        {authenticated ? 'Access Granted' : 'Access Denied'}
      </motion.h2>
    </div>
  )
}
