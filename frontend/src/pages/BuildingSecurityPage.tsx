import { useEffect, useState } from 'react'
import { Fingerprint, Mic, ScanFace } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getUser } from '../api/client'
import type { Modality } from '../api/types'
import { PrivacyIndicator } from '../components/PrivacyIndicator'
import { getBuilding } from '../config/buildings'
import { useSession } from '../context/SessionContext'

const MODALITY_META: Record<'face' | 'fingerprint' | 'voice', { label: string; icon: typeof ScanFace }> = {
  face: { label: 'Face', icon: ScanFace },
  fingerprint: { label: 'Fingerprint', icon: Fingerprint },
  voice: { label: 'Voice', icon: Mic },
}

export function BuildingSecurityPage() {
  const { buildingId } = useParams<{ buildingId: string }>()
  const navigate = useNavigate()
  const { userId } = useSession()
  const building = buildingId ? getBuilding(buildingId) : undefined

  const [selected, setSelected] = useState<Modality[]>(building?.requiredModalities ?? [])
  const [enrolled, setEnrolled] = useState<Modality[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getUser(userId).then((user) => {
      if (!cancelled) setEnrolled(user?.enrolled_modalities.map((m) => m.modality) ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!building) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-text-muted">Unknown facility.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-accent hover:underline">
          Back to facility list
        </Link>
      </div>
    )
  }

  const toggle = (modality: Modality) => {
    setSelected((prev) => (prev.includes(modality) ? prev.filter((m) => m !== modality) : [...prev, modality]))
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="mb-2 font-mono text-xs tracking-[0.2em] text-accent uppercase">{building.clearanceLevel} clearance</p>
      <h1 className="mb-2 text-2xl font-semibold text-text">{building.name}</h1>
      <p className="mb-8 text-sm text-text-muted">{building.description}</p>

      <div className="mb-6 rounded-lg border border-border bg-panel p-6">
        <p className="mb-4 font-mono text-[10px] tracking-wider text-text-dim uppercase">
          Choose verification factors
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(MODALITY_META) as Array<keyof typeof MODALITY_META>).map((modality) => {
            const { label, icon: Icon } = MODALITY_META[modality]
            const isSelected = selected.includes(modality)
            const isEnrolled = enrolled?.includes(modality)
            return (
              <button
                key={modality}
                onClick={() => toggle(modality)}
                className={`flex flex-col items-center gap-2 rounded-md border p-4 transition-colors ${
                  isSelected
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-text-muted hover:border-border-bright'
                }`}
              >
                <Icon className="h-6 w-6" />
                <span className="text-xs font-medium">{label}</span>
                <span className="font-mono text-[9px] tracking-wide text-text-dim uppercase">
                  {isEnrolled === undefined ? '...' : isEnrolled ? 'enrolled' : 'first use'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <button
        disabled={selected.length === 0}
        onClick={() => navigate(`/building/${building.id}/authenticate`, { state: { modalities: selected } })}
        className="mb-6 w-full rounded-md bg-accent py-3 font-mono text-sm tracking-wide text-void uppercase transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
      >
        Begin Authentication ({selected.length} factor{selected.length === 1 ? '' : 's'})
      </button>

      <PrivacyIndicator />
    </div>
  )
}
