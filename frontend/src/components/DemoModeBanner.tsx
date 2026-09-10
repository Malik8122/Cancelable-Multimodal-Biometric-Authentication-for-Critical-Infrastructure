import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useSession } from '../context/SessionContext'

// Deliberately does NOT offer a "simulate a response" fallback: this app
// never fabricates a biometric score or decision. When the backend is
// unreachable, the only honest thing to show is that fact - not a fake
// success screen. See docs/BACKEND_API.md and the project's "no fabricated
// scores" rule.
export function DemoModeBanner() {
  const { backendOnline } = useSession()

  if (backendOnline === null) return null

  if (backendOnline) {
    return (
      <div className="flex items-center gap-2 border-b border-success-dim/40 bg-success-dim/10 px-4 py-1.5 text-xs text-success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span className="font-mono tracking-wide">LIVE - connected to real backend inference</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 border-b border-warning-dim/40 bg-warning-dim/10 px-4 py-1.5 text-xs text-warning">
      <AlertTriangle className="h-3.5 w-3.5" />
      <span className="font-mono tracking-wide">
        BACKEND UNREACHABLE - captures will fail. Start it with `uvicorn backend.main:app --reload`.
      </span>
    </div>
  )
}
