import { motion } from 'motion/react'
import { AlertTriangle, CheckCircle2, Database, Fingerprint, Lock, Mic, ScanFace, Server, Shuffle } from 'lucide-react'
import { useSession } from '../../context/SessionContext'

interface Widget {
  key: string
  label: string
  icon: typeof Server
  healthy: (health: NonNullable<ReturnType<typeof useSession>['health']>) => boolean
  value: (health: NonNullable<ReturnType<typeof useSession>['health']>) => string
}

const WIDGETS: Widget[] = [
  { key: 'backend', label: 'Backend Online', icon: Server, healthy: (h) => h.backend === 'online', value: (h) => h.backend },
  { key: 'database', label: 'Database', icon: Database, healthy: (h) => h.database === 'connected', value: (h) => h.database },
  { key: 'face', label: 'Face Model', icon: ScanFace, healthy: (h) => h.face_model === 'loaded', value: (h) => h.face_model },
  {
    key: 'fingerprint',
    label: 'Fingerprint Model',
    icon: Fingerprint,
    healthy: (h) => h.fingerprint_model === 'loaded',
    value: (h) => h.fingerprint_model,
  },
  { key: 'voice', label: 'Voice Model', icon: Mic, healthy: (h) => h.voice_model === 'loaded', value: (h) => h.voice_model },
  {
    key: 'template',
    label: 'Template Protection',
    icon: Lock,
    healthy: (h) => h.template_protection === 'active',
    value: (h) => h.template_protection,
  },
  { key: 'fusion', label: 'Fusion Engine', icon: Shuffle, healthy: () => true, value: (h) => h.fusion_policy },
]

export function SystemStatusGrid() {
  const { health, backendOnline } = useSession()

  if (backendOnline === false) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-5 py-4"
      >
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <p className="text-sm text-warning">
          Backend unreachable. Live system status cannot be verified - start it with{' '}
          <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-xs">uvicorn backend.main:app --reload</code>.
        </p>
      </motion.div>
    )
  }

  if (!health) {
    return <div className="mx-auto h-24 max-w-4xl animate-pulse rounded-xl border border-border bg-card/40" />
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-4">
      {WIDGETS.map((widget, i) => {
        const healthy = widget.healthy(health)
        const Icon = widget.icon
        return (
          <motion.div
            key={widget.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-card/60 px-3 py-2.5 backdrop-blur"
          >
            <div className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${healthy ? 'bg-success/10' : 'bg-danger/10'}`}>
              <Icon className={`h-3.5 w-3.5 ${healthy ? 'text-success' : 'text-danger'}`} />
              {healthy && (
                <motion.span
                  className="absolute inset-0 rounded-md border border-success"
                  animate={{ opacity: [0.6, 0], scale: [1, 1.4] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-mono text-[9px] tracking-wide text-muted-foreground uppercase">{widget.label}</p>
              <p className={`flex items-center gap-1 truncate font-mono text-[11px] font-medium uppercase ${healthy ? 'text-success' : 'text-danger'}`}>
                {healthy ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
                {widget.value(health)}
              </p>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
