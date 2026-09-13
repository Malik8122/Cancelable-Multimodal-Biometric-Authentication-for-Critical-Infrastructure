import { motion } from 'motion/react'
import { BUILDINGS } from '../config/buildings'
import { BuildingCard } from '../components/buildings/BuildingCard'
import { FacilityNetworkMap } from '../components/network/FacilityNetworkMap'
import { HUDCornerWidgets } from '../components/network/HUDWidgets'
import { SystemStatusGrid } from '../components/system/SystemStatusGrid'
import { AuroraBackground } from '../components/ui/aurora-background'
import { Spotlight } from '../components/ui/spotlight-new'

const SPOTLIGHT_GRADIENT =
  'radial-gradient(68.54% 68.72% at 55.02% 31.46%, hsla(193, 100%, 70%, .08) 0, hsla(193, 100%, 55%, .03) 50%, hsla(193, 100%, 45%, 0) 80%)'

export function LandingPage() {
  return (
    <div>
      {/* HERO: Network Overview - one restrained background treatment
          (aurora + a single soft spotlight), not every effect stacked at
          once. */}
      <AuroraBackground className="relative flex !h-auto flex-col items-center overflow-hidden !bg-background px-6 pt-8 pb-16">
        <Spotlight gradientFirst={SPOTLIGHT_GRADIENT} />
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.15] [mask-image:radial-gradient(ellipse_55%_55%_at_50%_35%,black,transparent)]" />

        <div className="relative z-10 mx-auto mb-10 max-w-2xl text-center">
          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 font-mono text-[10px] tracking-[0.2em] text-primary uppercase"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Network Overview
          </motion.p>

          <h1 className="mb-3 font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            National Critical Infrastructure Security Network
          </h1>
          <p className="mx-auto max-w-xl text-sm text-muted-foreground sm:text-base">
            Privacy-preserving multimodal authentication - Face, Fingerprint, and Voice, fused server-side into a
            single cancelable identity decision.
          </p>
        </div>

        <div className="relative z-10 w-full">
          <HUDCornerWidgets />
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
            <FacilityNetworkMap />
          </motion.div>
        </div>
      </AuroraBackground>

      {/* Detailed per-subsystem status - a secondary strip, not competing
          with the hero's HUD gauges. */}
      <section className="relative mx-auto max-w-5xl px-6 pt-14">
        <p className="mb-4 text-center font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
          Subsystem Status
        </p>
        <SystemStatusGrid />
      </section>

      {/* BUILDINGS */}
      <section className="relative mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 text-center">
          <p className="mb-2 font-mono text-xs tracking-[0.25em] text-primary uppercase">Restricted Facilities</p>
          <h2 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Select an Access Checkpoint</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Each facility is protected by a real, running biometric backend - authentication decisions are computed
            server-side, never in this browser.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {BUILDINGS.map((building, index) => (
            <BuildingCard key={building.id} building={building} index={index} />
          ))}
        </div>
      </section>
    </div>
  )
}
