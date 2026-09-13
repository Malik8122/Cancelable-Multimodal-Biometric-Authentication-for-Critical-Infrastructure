import { ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'

export function TopBar() {
  const { userId } = useSession()

  return (
    <header className="relative z-30 flex items-center justify-between px-6 py-4 md:px-10">
      <Link to="/" className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10 shadow-[0_0_12px_var(--color-primary)]">
          <ShieldCheck className="h-4 w-4 text-primary" />
        </div>
        <div className="leading-tight">
          <p className="font-mono text-[11px] tracking-[0.25em] text-foreground uppercase">NCISN</p>
          <p className="font-mono text-[8px] tracking-[0.2em] text-muted-foreground uppercase">
            Critical Infrastructure Security
          </p>
        </div>
      </Link>
      <div
        className="rounded-full border border-border bg-card/60 px-3 py-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase backdrop-blur"
        title="Local demo identity, not a real account"
      >
        {userId}
      </div>
    </header>
  )
}
