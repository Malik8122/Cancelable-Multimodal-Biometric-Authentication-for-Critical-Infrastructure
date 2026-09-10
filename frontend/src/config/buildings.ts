import type { Modality } from '../api/types'

export interface Building {
  id: string
  name: string
  description: string
  requiredModalities: Modality[]
  clearanceLevel: 'Standard' | 'Elevated' | 'Critical'
}

// Demo content only - no real facilities, no real access-control claims.
// `requiredModalities` just decides which capture steps the security page
// offers for that building; the backend enforces nothing building-specific.
export const BUILDINGS: Building[] = [
  {
    id: 'data-center',
    name: 'Primary Data Center',
    description: 'Server halls and network core. Highest-assurance access only.',
    requiredModalities: ['face', 'fingerprint', 'voice'],
    clearanceLevel: 'Critical',
  },
  {
    id: 'research-lab',
    name: 'Research Laboratory',
    description: 'Restricted R&D floor. Dual-factor biometric checkpoint.',
    requiredModalities: ['face', 'fingerprint'],
    clearanceLevel: 'Elevated',
  },
  {
    id: 'admin-tower',
    name: 'Administration Tower',
    description: 'General office access. Single-factor checkpoint.',
    requiredModalities: ['face'],
    clearanceLevel: 'Standard',
  },
]

export function getBuilding(id: string): Building | undefined {
  return BUILDINGS.find((building) => building.id === id)
}
