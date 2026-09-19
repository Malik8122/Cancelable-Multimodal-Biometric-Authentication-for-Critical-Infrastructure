import { Activity, Fingerprint, KeyRound, LayoutGrid, ShieldCheck } from 'lucide-react'
import { FloatingDock } from '../ui/floating-dock'

const ITEMS = [
  { title: 'Campus', icon: <LayoutGrid className="h-full w-full" />, href: '/' },
  { title: 'Model Testing', icon: <Activity className="h-full w-full" />, href: '/testing' },
  { title: 'Security Analytics', icon: <ShieldCheck className="h-full w-full" />, href: '/analytics' },
  { title: 'Template Management', icon: <KeyRound className="h-full w-full" />, href: '/templates' },
  { title: 'Template Protection', icon: <Fingerprint className="h-full w-full" />, href: '/template-protection' },
]

export function NavDock() {
  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
      <FloatingDock items={ITEMS} />
    </div>
  )
}
