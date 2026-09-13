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
  distance: number
  template_version: number
  key_version: number
}

export interface ModalityAuthenticationResult {
  score: number
  threshold: number
  authenticated: boolean
  distance: number
  template_version: number
  key_version: number
}

export type FusionPolicy = 'ALL_REQUIRED' | 'AT_LEAST_TWO' | 'WEIGHTED'

export interface FusionAuthenticateResponse {
  user_id: string
  modalities_used: Modality[]
  results: Partial<Record<Modality, ModalityAuthenticationResult>>
  fused_score: number
  fusion_threshold: number
  authenticated: boolean
  fusion_policy: FusionPolicy
  required_modalities: Modality[]
  matched_modalities: Modality[]
  failed_modalities: Modality[]
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
  calibrated: boolean
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
    // Real protected-template calibration (evaluation/threshold_calibration.py) -
    // a different score space than the raw-embedding fields above, so these
    // are deliberately separate keys, never merged into far/frr/eer/auc.
    calibrated_threshold: number
    calibrated_far: number
    calibrated_frr: number
    calibrated_eer: number
    calibrated_auc: number
  }>
}

export interface SystemHealthResponse {
  backend: string
  database: string
  face_model: string
  fingerprint_model: string
  voice_model: string
  template_protection: string
  fusion_policy: FusionPolicy
  thresholds_loaded: boolean
  audit_logging: boolean
}

export interface AuditLogEntry {
  audit_id: string
  timestamp: string
  user_id: string
  building_id: string | null
  modality_list: Modality[]
  similarity_scores: Partial<Record<Modality, number>>
  thresholds_used: Partial<Record<Modality, number>>
  fusion_score: number | null
  fusion_policy: FusionPolicy | null
  authenticated: boolean
  latency_ms: number
  template_versions: Partial<Record<Modality, number>>
  key_versions: Partial<Record<Modality, number>>
}

export interface AuditHistoryResponse {
  user_id: string
  total: number
  limit: number
  offset: number
  entries: AuditLogEntry[]
}

export interface SystemAuditResponse {
  entries: AuditLogEntry[]
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
