import { motion } from 'motion/react'
import { ArrowDown, Database, Fingerprint, Grid3x3, KeyRound, Lock, Mic, RefreshCw, ScanFace, Shuffle } from 'lucide-react'
import { useMemo, useState } from 'react'

const PIPELINE = [
  { key: 'embed', title: 'Biometric Embedding', desc: 'Face / Fingerprint / Voice models each produce a fixed-length real-valued vector.', icon: ScanFace },
  { key: 'hkdf', title: 'HKDF Key Derivation', desc: 'A master secret plus user/modality/application/version context derives independent seeds via HKDF-SHA256.', icon: KeyRound },
  { key: 'projection', title: 'Random Projection Matrix', desc: 'An orthonormal matrix, seeded by the HKDF output, projects the embedding into bit-length space.', icon: Grid3x3 },
  { key: 'biohash', title: 'BioHash Transform', desc: 'Keyed quantization and a keyed bit permutation turn the projection into a binary template.', icon: Shuffle },
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
    <div className="mx-auto max-w-4xl px-6 py-14">
      <p className="mb-2 text-center text-xs font-medium tracking-wide text-muted-foreground">Educational Visualization</p>
      <h1 className="mb-3 text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        Cancelable Template Protection
      </h1>
      <p className="mx-auto mb-12 max-w-xl text-center text-sm text-muted-foreground">
        How a raw biometric sample becomes a non-reversible, revocable protected template - the exact pipeline this
        backend runs on every enrollment and authentication.
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
              transition={{ delay: i * 0.05 }}
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

      {/* Revocation demo */}
      <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-xl sm:p-8">
        <p className="mb-1 text-xs font-medium tracking-wide text-primary">Interactive Demo</p>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-foreground">Template Revocation</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Rotating the key version regenerates a completely unrelated template from the same biometric - the old
          template becomes permanently invalid without ever touching the original data.
        </p>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-danger">
              Key v{Math.max(1, keyVersion - 1)} - {keyVersion > 1 ? 'Revoked' : 'Active'}
            </p>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-black/40 p-3">
              {oldTemplate.map((bit, i) => (
                <span key={i} className={`text-[10px] ${keyVersion > 1 ? 'text-danger/40 line-through' : 'text-primary'}`}>
                  {bit}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-success">
              Key v{keyVersion > 1 ? keyVersion : keyVersion + 1} - {keyVersion > 1 ? 'Active' : 'Not yet generated'}
            </p>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-black/40 p-3">
              {(keyVersion > 1 ? newTemplate : oldTemplate.map(() => '·')).map((bit, i) => (
                <motion.span
                  key={i}
                  animate={rotating ? { opacity: [1, 0.2, 1] } : { opacity: 1 }}
                  transition={{ duration: 0.4, delay: i * 0.01 }}
                  className={`text-[10px] ${keyVersion > 1 ? 'text-success' : 'text-muted-foreground/40'}`}
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
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground shadow-lg shadow-black/20 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${rotating ? 'animate-spin' : ''}`} strokeWidth={1.5} />
          {rotating ? 'Rotating Key...' : 'Simulate Key Rotation'}
        </button>
        <p className="mt-3 text-center text-xs text-muted-foreground/70">
          Illustrative demo - mirrors POST /revoke-template's real key_version increment
        </p>
      </div>
    </div>
  )
}
