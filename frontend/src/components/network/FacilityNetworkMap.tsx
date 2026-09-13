import { motion } from 'motion/react'
import { ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { BUILDINGS } from '../../config/buildings'
import { useReducedMotion } from '../../hooks/useReducedMotion'

const VIEW_SIZE = 480
const CENTER = VIEW_SIZE / 2
const RADIUS = 170

// A restrained SVG hub-and-spoke diagram, not a photographic map - honest
// about being a stylized network diagram rather than an implied live
// satellite feed. Facility positions are computed, not hand-placed, so
// adding/removing a facility in config/buildings.ts never needs layout work.
export function FacilityNetworkMap() {
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()
  const count = BUILDINGS.length

  const nodes = BUILDINGS.map((building, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2
    const x = CENTER + RADIUS * Math.cos(angle)
    const y = CENTER + RADIUS * Math.sin(angle)
    return { building, x, y }
  })

  return (
    <div className="relative mx-auto w-full max-w-md">
      <svg viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} className="h-auto w-full" role="img" aria-label="Facility network map">
        {/* Concentric range rings, purely decorative structure */}
        {[RADIUS * 0.5, RADIUS * 0.78, RADIUS].map((r) => (
          <circle key={r} cx={CENTER} cy={CENTER} r={r} fill="none" stroke="var(--color-border)" strokeWidth={1} />
        ))}

        {/* Connector lines: hub -> each facility */}
        {nodes.map(({ building, x, y }) => (
          <g key={building.id}>
            <line x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="var(--color-border)" strokeWidth={1.5} />
            {!reducedMotion && (
              <motion.circle
                r={2.5}
                fill="var(--color-primary)"
                animate={{
                  cx: [CENTER, x],
                  cy: [CENTER, y],
                  opacity: [0, 1, 0],
                }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'linear', delay: Math.random() * 2 }}
              />
            )}
          </g>
        ))}

        {/* Hub */}
        <circle cx={CENTER} cy={CENTER} r={26} fill="var(--color-card)" stroke="var(--color-primary)" strokeWidth={1.5} />
      </svg>

      {/* Hub icon, HTML-positioned to match the SVG center exactly */}
      <div
        className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/50 bg-card"
        style={{ left: `${(CENTER / VIEW_SIZE) * 100}%`, top: `${(CENTER / VIEW_SIZE) * 100}%` }}
      >
        <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
      </div>

      {/* Facility node badges, HTML-positioned to match SVG coordinates */}
      {nodes.map(({ building, x, y }, i) => (
        <motion.button
          key={building.id}
          type="button"
          onClick={() => navigate(`/building/${building.id}`)}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 + i * 0.06 }}
          whileHover={{ scale: 1.05 }}
          whileFocus={{ scale: 1.05 }}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card/90 px-2.5 py-1.5 text-center backdrop-blur transition-colors hover:border-primary/60 focus-visible:border-primary"
          style={{ left: `${(x / VIEW_SIZE) * 100}%`, top: `${(y / VIEW_SIZE) * 100}%` }}
        >
          <span className="block w-24 font-mono text-[9px] leading-tight font-medium tracking-wide text-foreground uppercase sm:w-28">
            {building.name}
          </span>
        </motion.button>
      ))}
    </div>
  )
}
