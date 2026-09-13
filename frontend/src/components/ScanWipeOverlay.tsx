import { motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useReducedMotion } from '../hooks/useReducedMotion'

/** A themed "security scan" band that sweeps down the viewport on every
 * route change - purely decorative and non-interactive, layered above page
 * content but never blocking clicks. */
export function ScanWipeOverlay() {
  const location = useLocation()
  const reducedMotion = useReducedMotion()

  if (reducedMotion) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <motion.div
        key={location.pathname}
        className="absolute inset-x-0 h-32 bg-gradient-to-b from-transparent via-accent/20 to-transparent"
        initial={{ top: '-15%', opacity: 0 }}
        animate={{ top: '115%', opacity: [0, 1, 1, 0] }}
        transition={{ duration: 0.7, ease: 'easeInOut', times: [0, 0.2, 0.8, 1] }}
      />
    </div>
  )
}
