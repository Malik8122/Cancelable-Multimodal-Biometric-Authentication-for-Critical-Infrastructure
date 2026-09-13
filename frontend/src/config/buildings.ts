import type { Modality } from '../api/types'

export interface Building {
  id: string
  name: string
  clearanceLevel: 'III' | 'IV' | 'V'
  description: string
  requiredModalities: Modality[]
}

// Demo content only - no real facilities, no real access-control claims.
// `requiredModalities` decides which capture steps registration/authentication
// offer by default for that building; the backend enforces nothing
// building-specific (it has no concept of "buildings" at all).
export const BUILDINGS: Building[] = [
  {
    id: 'national-data-centre',
    name: 'National Data Centre',
    clearanceLevel: 'V',
    description: 'Primary sovereign data infrastructure. Maximum-assurance tri-factor checkpoint.',
    requiredModalities: ['face', 'fingerprint', 'voice'],
  },
  {
    id: 'defence-intelligence-hq',
    name: 'Defence Intelligence Headquarters',
    clearanceLevel: 'IV',
    description: 'Classified intelligence operations floor. Dual-factor biometric checkpoint.',
    requiredModalities: ['face', 'fingerprint'],
  },
  {
    id: 'central-research-laboratory',
    name: 'Central Research Laboratory',
    clearanceLevel: 'III',
    description: 'Restricted R&D wing. Voice-augmented facial checkpoint.',
    requiredModalities: ['face', 'voice'],
  },
  {
    id: 'reserve-bank-vault',
    name: 'Reserve Bank Secure Vault',
    clearanceLevel: 'V',
    description: 'National reserve custody vault. Maximum-assurance tri-factor checkpoint.',
    requiredModalities: ['face', 'fingerprint', 'voice'],
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
