import { motion } from 'motion/react'
import {
  ArrowDown,
  Database,
  Fingerprint,
  Gauge,
  Grid3x3,
  KeyRound,
  Layers,
  Lock,
  Mic,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Shuffle,
} from 'lucide-react'
import { useState } from 'react'
import type { Modality, TemplateSetStatus } from '../api/types'
import { TemplateSetCard } from '../components/biometric/TemplateSetCard'

const POOL_SIZE = 4
const DEMO_MODALITIES: Modality[] = ['face', 'fingerprint', 'voice']

const PIPELINE = [
  { key: 'embed', title: 'Biometric Embeddings', desc: 'Each model turns its capture into a fixed-length vector - once. The vectors exist only in memory and are discarded after the templates are built.', icon: ScanFace },
  { key: 'hkdf', title: 'HKDF Keys v1 - v4', desc: 'HKDF-SHA256 derives an independent key per template set (and per modality) from the master secret plus user / modality / application / key version. Keys are derived, never stored.', icon: KeyRound },
  { key: 'biohash', title: 'BioHash', desc: 'Each key seeds a random orthonormal projection, keyed quantization thresholds and a bit permutation - the same embedding yields unrelated 256-bit templates under different keys.', icon: Shuffle },
  { key: 'pool', title: 'Template Set Pool', desc: 'Set 1 (Face V1 + Fingerprint V1 + Voice V1) is ACTIVE; Sets 2-4 are STANDBY. A set is one complete multimodal credential and is never mixed with another set.', icon: Grid3x3 },
  { key: 'storage', title: 'Secure Storage', desc: 'Only the protected bits and set lifecycle metadata are persisted. No image, audio or embedding is ever written.', icon: Database },
  { key: 'auth', title: 'Authentication', desc: 'A fresh capture is re-hashed under the ACTIVE set\'s keys and compared with the ACTIVE set\'s templates only.', icon: Lock },
  { key: 'fusion', title: 'Fusion Similarity', desc: 'Per-modality similarities stay inside the backend (audit / testing only) and are fused into one similarity under the fusion policy (ALL_REQUIRED by default).', icon: Layers },
  { key: 'decision', title: 'Access Decision', desc: 'The client only receives Access Granted / Denied, the single fusion similarity (on grant) and the template set version.', icon: Gauge },
]

const MODALITIES = [
  { key: 'face', label: 'Face', icon: ScanFace },
  { key: 'fingerprint', label: 'Fingerprint', icon: Fingerprint },
  { key: 'voice', label: 'Voice', icon: Mic },
]

interface DemoSet {
  version: number
  status: TemplateSetStatus
}

const freshPool = (): DemoSet[] =>
  Array.from({ length: POOL_SIZE }, (_, i) => ({ version: i + 1, status: i === 0 ? 'ACTIVE' : 'STANDBY' }))

export function TemplateProtectionPage() {
  const [pool, setPool] = useState<DemoSet[]>(freshPool)
  const [flash, setFlash] = useState<number | null>(null)

  const standbyLeft = pool.filter((s) => s.status === 'STANDBY').length
  const active = pool.find((s) => s.status === 'ACTIVE')

  const revoke = () => {
    if (!active || standbyLeft === 0) return
    const next = pool.find((s) => s.status === 'STANDBY')!
    setFlash(next.version)
    setPool((prev) =>
      prev.map((s) =>
        s.version === active.version ? { ...s, status: 'REVOKED' } : s.version === next.version ? { ...s, status: 'ACTIVE' } : s,
      ),
    )
    window.setTimeout(() => setFlash(null), 900)
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <p className="mb-2 text-center text-xs font-medium tracking-wide text-muted-foreground">Educational Visualization</p>
      <h1 className="mb-3 text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        Template Set Protection
      </h1>
      <p className="mx-auto mb-10 max-w-xl text-center text-sm text-muted-foreground">
        How registration produces a pool of non-reversible, revocable template sets - each one a complete multimodal
        credential - and how authentication uses only the active set. The exact pipeline this backend runs.
      </p>

      <div className="mb-8 flex justify-center gap-3">
        {MODALITIES.map((m) => (
          <div key={m.key} className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5">
            <m.icon className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
            <span className="text-xs font-medium text-primary">{m.label}</span>
          </div>
        ))}
      </div>

      <div className="mb-16 space-y-3">
        {PIPELINE.map((stage, i) => (
          <div key={stage.key}>
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-4 rounded-xl border border-border bg-card/60 p-4 backdrop-blur-xl"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
                <stage.icon className="h-5 w-5 text-primary" strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{stage.title}</p>
                <p className="text-sm text-muted-foreground">{stage.desc}</p>
              </div>
            </motion.div>
            {i < PIPELINE.length - 1 && (
              <div className="flex justify-center py-1">
                <ArrowDown className="h-3.5 w-3.5 text-border" strokeWidth={1.5} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Revocation animation */}
      <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-xl sm:p-8">
        <p className="mb-1 text-xs font-medium tracking-wide text-primary">Interactive Demo</p>
        <h2 className="mb-2 text-lg font-semibold tracking-tight text-foreground">Template Set Revocation</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Revoking the active set retires its face, fingerprint and voice templates together and activates the oldest
          standby set for all three at once - the same person keeps authenticating, nothing is re-enrolled. With no
          standby set left, re-enrollment is required.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pool.map((s) => (
            <motion.div
              key={s.version}
              animate={flash === s.version ? { scale: [1, 1.05, 1] } : { scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <TemplateSetCard set={{ version: s.version, status: s.status, modalities: DEMO_MODALITIES }} />
            </motion.div>
          ))}
        </div>

        <button
          onClick={revoke}
          disabled={!active || standbyLeft === 0}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground shadow-lg shadow-black/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ShieldCheck className="h-4 w-4" strokeWidth={1.5} />
          {standbyLeft === 0 ? 'Template set pool exhausted - re-enrollment required' : 'Revoke Active Set'}
        </button>
        {standbyLeft === 0 && (
          <button
            onClick={() => setPool(freshPool())}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:border-white/25 hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
            Re-enroll (reset demo)
          </button>
        )}
        <p className="mt-3 text-center text-xs text-muted-foreground/70">
          Illustrative demo - mirrors POST /revoke-template (which needs biometric authorization and answers 409 when the
          set pool is exhausted)
        </p>
      </div>
    </div>
  )
}
