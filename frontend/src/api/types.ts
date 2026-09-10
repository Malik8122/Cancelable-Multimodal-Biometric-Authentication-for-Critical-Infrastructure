// Mirrors backend/database/schema.py exactly. Nothing here is computed on
// the frontend - these are wire types for what the backend already returns.

export type Modality = 'face' | 'iris' | 'fingerprint' | 'voice'

export interface EnrollResponse {
  success: boolean
  user_id: string
  modality: Modality
  template_version: number
  key_version: number
  template_id: string
}

export interface AuthenticateResponse {
  user_id: string
  modality: Modality
  score: number
  threshold: number
  authenticated: boolean
}

export interface ModalityAuthenticationResult {
  score: number
  threshold: number
  authenticated: boolean
}

export interface FusionAuthenticateResponse {
  user_id: string
  modalities_used: Modality[]
  results: Partial<Record<Modality, ModalityAuthenticationResult>>
  fused_score: number
  fusion_threshold: number
  authenticated: boolean
}

export interface RevokeResponse {
  success: boolean
  user_id: string
  modality: Modality
  old_key_version: number
  new_key_version: number
  template_id: string
}

export interface EnrolledModality {
  modality: Modality
  application_id: string
  template_version: number
  key_version: number
  created_at: string
}

export interface UserModalitiesResponse {
  user_id: string
  enrolled_modalities: EnrolledModality[]
}

export interface ModalityMetricsResponse {
  modality: Modality
  available: boolean
  metrics: Partial<{
    num_samples: number
    num_genuine_pairs: number
    num_impostor_pairs: number
    eer: number
    eer_threshold: number
    accuracy: number
    far: number
    frr: number
    precision: number
    recall: number
    f1: number
    auc: number
  }>
}

export interface ApiErrorBody {
  detail: string
}

// Not a backend type - thrown by api/client.ts for any non-2xx response so
// callers can distinguish "the backend said no" from "the backend is down".
export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}
