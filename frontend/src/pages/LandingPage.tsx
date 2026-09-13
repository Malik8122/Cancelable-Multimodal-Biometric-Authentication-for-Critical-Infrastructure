import { motion } from 'motion/react'
import { BUILDINGS } from '../config/buildings'
import { BuildingCard } from '../components/buildings/BuildingCard'
import { SystemStatusGrid } from '../components/system/SystemStatusGrid'
import { AuroraBackground } from '../components/ui/aurora-background'
import { BackgroundBeams } from '../components/ui/background-beams'
import { Spotlight } from '../components/ui/spotlight-new'
import { TextGenerateEffect } from '../components/ui/text-generate-effect'

const SPOTLIGHT_GRADIENT =
  'radial-gradient(68.54% 68.72% at 55.02% 31.46%, hsla(187, 100%, 75%, .12) 0, hsla(187, 100%, 55%, .04) 50%, hsla(187, 100%, 45%, 0) 80%)'

export function LandingPage() {
  return (
    <div>
      {/* HERO */}
      <AuroraBackground className="relative flex !h-auto min-h-[92vh] flex-col items-center justify-center overflow-hidden !bg-background px-6 pt-6 pb-16">
        <Spotlight gradientFirst={SPOTLIGHT_GRADIENT} />
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_30%,black,transparent)]" />
        <div className="absolute inset-0 h-full w-full">
          <BackgroundBeams className="opacity-60" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 font-mono text-[10px] tracking-[0.2em] text-primary uppercase"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Security Operations Center
          </motion.p>

          <h1 className="mb-5 text-4xl leading-[1.1] font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
              National Critical Infrastructure
            </span>
            <br />
            <span className="bg-gradient-to-r from-primary via-primary to-secondary bg-clip-text text-transparent">
              Security Network
            </span>
          </h1>

          <TextGenerateEffect
            words="Privacy-Preserving Multimodal Authentication - Face, Fingerprint, and Voice, fused into a single cancelable identity."
            className="mx-auto max-w-2xl"
            wordClassName="text-base text-muted-foreground sm:text-lg"
            duration={0.6}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="relative z-10 mt-12 w-full"
        >
          <SystemStatusGrid />
        </motion.div>
      </AuroraBackground>

      {/* BUILDINGS */}
      <section className="relative mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 text-center">
          <p className="mb-2 font-mono text-xs tracking-[0.25em] text-primary uppercase">Restricted Facilities</p>
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Select an Access Checkpoint</h2>
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
