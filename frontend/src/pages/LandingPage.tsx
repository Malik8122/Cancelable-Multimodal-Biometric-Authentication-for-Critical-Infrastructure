import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BuildingSilhouette } from '../components/campus/BuildingSilhouette'
import { BUILDINGS, type Building } from '../config/buildings'
import { useReducedMotion } from '../hooks/useReducedMotion'

const STARS = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 37 + 5) % 100}%`,
  top: `${(i * 53 + 8) % 55}%`,
  delay: (i % 6) * 0.7,
}))

export function LandingPage() {
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()
  const [hovered, setHovered] = useState<string | null>(null)
  const [entering, setEntering] = useState<Building | null>(null)

  const enterBuilding = (building: Building) => {
    if (entering) return
    setEntering(building)
    const delay = reducedMotion ? 250 : 1500
    window.setTimeout(() => navigate(`/building/${building.id}`), delay)
  }

  return (
    <div className="relative min-h-[80vh] overflow-hidden">
      {/* Evening sky over the campus grounds - an illustrated scene, not a
          photograph we have no rights to use. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, #0a1330 0%, #0d1a3c 38%, #1b2748 62%, #33324a 80%, #4a3c44 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%]"
        style={{
          background: 'radial-gradient(ellipse 70% 100% at 50% 100%, rgba(224,150,90,0.16), transparent 65%)',
        }}
      />
      {!reducedMotion &&
        STARS.map((star, i) => (
          <motion.span
            key={i}
            className="pointer-events-none absolute h-[2px] w-[2px] rounded-full bg-white"
            style={{ left: star.left, top: star.top }}
            animate={{ opacity: [0.15, 0.7, 0.15] }}
            transition={{ duration: 4 + (i % 4), repeat: Infinity, delay: star.delay }}
          />
        ))}
      <div className="pointer-events-none absolute inset-x-0 bottom-[30%] h-px bg-white/[0.06]" />

      {/* Ground */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-[#070c1e]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-grid opacity-[0.35] [mask-image:linear-gradient(to_bottom,transparent,black_40%)]" />

      {/* Content */}
      <div className="relative z-10 mx-auto flex min-h-[80vh] max-w-6xl flex-col px-6 pt-14 pb-10">
        <div className="mx-auto mb-auto max-w-xl text-center">
          <p className="mb-3 text-xs font-medium tracking-[0.2em] text-white/50 uppercase">
            National Critical Infrastructure Campus
          </p>
          <h1 className="mb-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Select a facility to enter
          </h1>
          <p className="text-sm text-white/60 sm:text-base">
            Each building is protected by its own biometric identity checkpoint.
          </p>
        </div>

        <div className="mt-auto grid grid-cols-2 items-end gap-x-4 gap-y-10 sm:flex sm:items-end sm:justify-center sm:gap-10 md:gap-16">
          {BUILDINGS.map((building, i) => (
            <motion.button
              key={building.id}
              type="button"
              onClick={() => enterBuilding(building)}
              onMouseEnter={() => setHovered(building.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(building.id)}
              onBlur={() => setHovered(null)}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              whileHover={reducedMotion ? undefined : { y: -10 }}
              whileFocus={reducedMotion ? undefined : { y: -10 }}
              className="group flex cursor-pointer flex-col items-center gap-3 text-left"
              aria-label={`Enter ${building.name}, clearance level ${building.clearanceLevel}`}
            >
              <div
                className={`overflow-hidden rounded-sm border transition-all duration-500 ${
                  hovered === building.id ? 'border-primary/70' : 'border-white/10'
                }`}
                style={{
                  filter:
                    hovered === building.id
                      ? 'drop-shadow(0 18px 30px rgba(0,0,0,0.45))'
                      : 'drop-shadow(0 8px 16px rgba(0,0,0,0.3))',
                }}
              >
                <BuildingSilhouette
                  seed={i + 1}
                  brightness={hovered === building.id ? 1 : 0.25}
                  className="h-40 w-[5.5rem] sm:h-56 sm:w-32"
                />
              </div>

              <div className="flex flex-col items-center gap-1.5">
                <span className="text-xs font-medium text-white sm:text-sm">{building.name}</span>
                <AnimatePresence mode="wait">
                  {hovered === building.id ? (
                    <motion.span
                      key="badge"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-primary"
                    >
                      Clearance Level {building.clearanceLevel}
                    </motion.span>
                  ) : (
                    <motion.span key="plain" exit={{ opacity: 0 }} className="text-[10px] text-white/40">
                      Clearance Level {building.clearanceLevel}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Hero transition: camera pushes toward the entrance, doors open,
          fade through into the lobby. */}
      <AnimatePresence>
        {entering && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#070c1e]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reducedMotion ? 0.15 : 0.4 }}
          >
            {!reducedMotion && (
              <>
                <motion.div
                  initial={{ scale: 0.7, opacity: 0.9 }}
                  animate={{ scale: 2.6, opacity: 0 }}
                  transition={{ duration: 1.3, ease: [0.4, 0, 0.2, 1] }}
                >
                  <BuildingSilhouette seed={BUILDINGS.indexOf(entering) + 1} brightness={1} className="h-64 w-36" />
                </motion.div>
                <motion.div
                  className="absolute top-1/2 left-1/2 h-40 w-3 -translate-y-1/2 bg-[#0b1736]"
                  initial={{ x: '-100%' }}
                  animate={{ x: '-140%' }}
                  transition={{ duration: 0.7, delay: 0.35, ease: [0.76, 0, 0.24, 1] }}
                />
                <motion.div
                  className="absolute top-1/2 left-1/2 h-40 w-3 -translate-y-1/2 bg-[#0b1736]"
                  initial={{ x: '0%' }}
                  animate={{ x: '40%' }}
                  transition={{ duration: 0.7, delay: 0.35, ease: [0.76, 0, 0.24, 1] }}
                />
              </>
            )}
            <motion.div
              className="absolute inset-0 bg-background"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: reducedMotion ? 0 : 0.85 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
