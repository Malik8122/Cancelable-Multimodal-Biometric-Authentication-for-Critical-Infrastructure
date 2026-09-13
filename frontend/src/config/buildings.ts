import type { Modality } from '../api/types'

export interface Building {
  id: string
  name: string
  clearanceLevel: 'III' | 'IV' | 'V'
  description: string
  requiredModalities: Modality[]
}

// Demo content only - no real facilities, no real access-control claims.
// `requiredModalities` decides which factors are pre-selected on the
// authentication portal for that building; the backend enforces nothing
// building-specific (it has no concept of "buildings" at all). Registration
// always captures all three modalities, independent of building.
export const BUILDINGS: Building[] = [
  {
    id: 'national-data-centre',
    name: 'National Data Centre',
    clearanceLevel: 'V',
    description: 'Primary sovereign data infrastructure.',
    requiredModalities: ['face', 'fingerprint', 'voice'],
  },
  {
    id: 'defence-intelligence-hq',
    name: 'Defence Intelligence Headquarters',
    clearanceLevel: 'IV',
    description: 'Classified intelligence operations floor.',
    requiredModalities: ['face', 'fingerprint'],
  },
  {
    id: 'reserve-bank-vault',
    name: 'Reserve Bank Secure Vault',
    clearanceLevel: 'V',
    description: 'National reserve custody vault.',
    requiredModalities: ['face', 'fingerprint', 'voice'],
  },
  {
    id: 'central-research-laboratory',
    name: 'Central Research Laboratory',
    clearanceLevel: 'III',
    description: 'Restricted research and development wing.',
    requiredModalities: ['face', 'voice'],
  },
]

export function getBuilding(id: string): Building | undefined {
  return BUILDINGS.find((building) => building.id === id)
}

export function securityStrength(modalities: Modality[]): 'None' | 'Medium' | 'High' | 'Maximum' {
  const count = modalities.length
  if (count === 0) return 'None'
  if (count === 1) return 'Medium'
  if (count === 2) return 'High'
  return 'Maximum'
}
