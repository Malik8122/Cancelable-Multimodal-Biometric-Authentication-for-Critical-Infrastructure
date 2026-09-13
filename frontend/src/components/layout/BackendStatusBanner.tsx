import { motion } from 'motion/react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { useSession } from '../../context/SessionContext'

// Never fabricates a "connected" state, and never offers a fake-data
// fallback - if the backend is unreachable, the only honest thing to show
// is that fact (see docs/BACKEND_API.md and the project's "no fabricated
// scores" rule). All status here comes from GET /system/health.
export function BackendStatusBanner() {
  const { backendOnline } = useSession()

  if (backendOnline === null) return null

  if (backendOnline) {
    return (
      <div className="flex items-center justify-center gap-2 border-b border-success/20 bg-success/5 px-4 py-1.5">
        <ShieldCheck className="h-3 w-3 text-success" strokeWidth={1.5} />
        <span className="text-xs text-success">Secure link established - live backend inference</span>
      </div>
    )
  }

  return (
    <motion.div
      animate={{ opacity: [1, 0.6, 1] }}
      transition={{ duration: 1.6, repeat: Infinity }}
      className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-1.5"
    >
      <ShieldAlert className="h-3 w-3 text-warning" strokeWidth={1.5} />
      <span className="text-xs text-warning">
        Backend unreachable - start it with `uvicorn backend.main:app --reload`
      </span>
    </motion.div>
  )
}
