import { motion } from 'motion/react'
import { ArrowDown, Database, Fingerprint, Grid3x3, KeyRound, Lock, Mic, RefreshCw, ScanFace, Shuffle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { GlowingEffect } from '../components/ui/glowing-effect'

const PIPELINE = [
  { key: 'embed', title: 'Biometric Embedding', desc: 'Face / Fingerprint / Voice models each produce a fixed-length real-valued vector.', icon: ScanFace },
  { key: 'hkdf', title: 'HKDF Key Derivation', desc: 'A master secret + user/modality/application/version context derives three independent seeds via HKDF-SHA256.', icon: KeyRound },
  { key: 'projection', title: 'Random Projection Matrix', desc: 'An orthonormal matrix, seeded by HKDF output, projects the embedding into bit-length space.', icon: Grid3x3 },
  { key: 'biohash', title: 'BioHash Transform', desc: 'Keyed quantization + keyed bit permutation turn the projection into a binary template.', icon: Shuffle },
  { key: 'template', title: 'Protected Template Bits', desc: 'A fixed-length 0/1 array - non-invertible by design, unrelated to the raw embedding without the key.', icon: Lock },
  { key: 'sqlite', title: 'Encrypted SQLite Storage', desc: 'Only these protected bits are persisted. No raw image, audio, or embedding is ever written to disk.', icon: Database },
]

const MODALITIES = [
  { key: 'face', label: 'Face', icon: ScanFace },
  { key: 'fingerprint', label: 'Fingerprint', icon: Fingerprint },
  { key: 'voice', label: 'Voice', icon: Mic },
]

function randomBits(n: number) {
  return Array.from({ length: n }, () => (Math.random() > 0.5 ? 1 : 0))
}

export function TemplateProtectionPage() {
  const [keyVersion, setKeyVersion] = useState(1)
  const [rotating, setRotating] = useState(false)
  const oldTemplate = useMemo(() => randomBits(48), [])
  const [newTemplate, setNewTemplate] = useState(oldTemplate)

  const rotate = () => {
    setRotating(true)
    window.setTimeout(() => {
      setNewTemplate(randomBits(48))
      setKeyVersion((v) => v + 1)
      setRotating(false)
    }, 900)
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className="mb-2 text-center font-mono text-xs tracking-[0.25em] text-primary uppercase">Educational Visualization</p>
      <h1 className="mb-2 text-center text-2xl font-semibold text-foreground">Cancelable Template Protection</h1>
      <p className="mx-auto mb-10 max-w-xl text-center text-sm text-muted-foreground">
        How a raw biometric sample becomes a non-reversible, revocable protected template - the exact pipeline this
        backend runs on every enrollment and authentication.
      </p>

      <div className="mb-6 flex justify-center gap-3">
        {MODALITIES.map((m) => (
          <div key={m.key} className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5">
            <m.icon className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[10px] tracking-wide text-primary uppercase">{m.label}</span>
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
              transition={{ delay: i * 0.05 }}
              className="relative flex items-center gap-4 rounded-xl border border-border bg-card/60 p-4"
            >
              <GlowingEffect disabled={false} proximity={70} spread={28} borderWidth={1.5} />
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                <stage.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="relative min-w-0">
                <p className="text-sm font-medium text-foreground">{stage.title}</p>
                <p className="text-xs text-muted-foreground">{stage.desc}</p>
              </div>
            </motion.div>
            {i < PIPELINE.length - 1 && (
              <div className="flex justify-center py-1">
                <ArrowDown className="h-3.5 w-3.5 text-border" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Revocation demo */}
      <div className="relative rounded-2xl border border-border bg-card/60 p-6">
        <GlowingEffect disabled={false} proximity={80} spread={30} borderWidth={2} />
        <p className="relative mb-1 font-mono text-[10px] tracking-wider text-primary uppercase">Interactive Demo</p>
        <h2 className="relative mb-4 text-lg font-semibold text-foreground">Template Revocation</h2>
        <p className="relative mb-6 text-sm text-muted-foreground">
          Rotating the key version regenerates a completely unrelated template from the same biometric - the old
          template becomes permanently invalid without ever touching the original data.
        </p>

        <div className="relative grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 font-mono text-[10px] tracking-wide text-danger uppercase">
              Key v{Math.max(1, keyVersion - 1)} - {keyVersion > 1 ? 'REVOKED' : 'ACTIVE'}
            </p>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-black p-3">
              {oldTemplate.map((bit, i) => (
                <span key={i} className={`font-mono text-[10px] ${keyVersion > 1 ? 'text-danger/40 line-through' : 'text-primary'}`}>
                  {bit}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 font-mono text-[10px] tracking-wide text-success uppercase">
              Key v{keyVersion > 1 ? keyVersion : keyVersion + 1} - {keyVersion > 1 ? 'ACTIVE' : 'NOT YET GENERATED'}
            </p>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-black p-3">
              {(keyVersion > 1 ? newTemplate : oldTemplate.map(() => '·')).map((bit, i) => (
                <motion.span
                  key={i}
                  animate={rotating ? { opacity: [1, 0.2, 1] } : { opacity: 1 }}
                  transition={{ duration: 0.4, delay: i * 0.01 }}
                  className={`font-mono text-[10px] ${keyVersion > 1 ? 'text-success' : 'text-muted-foreground/40'}`}
                >
                  {bit}
                </motion.span>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={rotate}
          disabled={rotating}
          className="relative mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-mono text-xs tracking-wide text-primary-foreground uppercase shadow-[0_0_20px_color-mix(in_srgb,var(--color-primary)_40%,transparent)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${rotating ? 'animate-spin' : ''}`} />
          {rotating ? 'Rotating Key...' : 'Simulate Key Rotation'}
        </button>
        <p className="relative mt-3 text-center font-mono text-[9px] tracking-wider text-muted-foreground/70 uppercase">
          Illustrative demo - mirrors POST /revoke-template's real key_version increment
        </p>
      </div>
    </div>
  )
}
