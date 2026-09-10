import { BuildingCard } from '../components/BuildingCard'
import { BUILDINGS } from '../config/buildings'

export function LandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="mb-10">
        <p className="mb-2 font-mono text-xs tracking-[0.2em] text-accent uppercase">Select a facility</p>
        <h1 className="text-2xl font-semibold text-text">Multimodal Biometric Access</h1>
        <p className="mt-2 max-w-xl text-sm text-text-muted">
          Each facility is protected by a real, running biometric backend - face, fingerprint, and voice
          verification, fused server-side into a single access decision.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BUILDINGS.map((building, index) => (
          <BuildingCard key={building.id} building={building} index={index} />
        ))}
      </div>
    </div>
  )
}
