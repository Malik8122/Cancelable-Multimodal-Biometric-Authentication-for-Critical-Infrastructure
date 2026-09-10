import { ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSession } from '../context/SessionContext'

export function SecurityHeader() {
  const { userId } = useSession()

  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <Link to="/" className="flex items-center gap-2.5">
        <ShieldCheck className="h-5 w-5 text-accent" />
        <span className="font-mono text-sm tracking-[0.2em] text-text uppercase">Biometric Access Console</span>
      </Link>
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <Link to="/testing" className="font-mono tracking-wide transition-colors hover:text-accent">
          Model Testing
        </Link>
        <span className="font-mono text-text-dim">|</span>
        <span className="font-mono" title="Local demo identity, not a real account">
          {userId}
        </span>
      </div>
    </header>
  )
}
