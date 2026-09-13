import { ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'

export function TopBar() {
  const { userId } = useSession()

  return (
    <header className="relative z-30 flex items-center justify-between px-6 py-4 md:px-10">
      <Link to="/" className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/25 bg-primary/10">
          <ShieldCheck className="h-4 w-4 text-primary" strokeWidth={1.5} />
        </div>
        <div className="leading-tight">
          <p className="text-[13px] font-medium text-foreground">NCISN</p>
          <p className="text-[10px] text-muted-foreground">Critical Infrastructure Security</p>
        </div>
      </Link>
      <div
        className="rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur"
        title="Local demo identity, not a real account"
      >
        {userId}
      </div>
    </header>
  )
}
