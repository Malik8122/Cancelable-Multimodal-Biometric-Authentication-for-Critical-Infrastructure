// The only place in this app that calls `fetch`. Every biometric endpoint
// call goes through here so there is exactly one spot that knows the base
// URL, and so no component can accidentally hand-roll its own request.
//
// This layer does zero score/decision computation - it only shapes requests
// and parses responses. Fusion, FAR/FRR/EER, and match/no-match decisions
// are all computed server-side (see backend/api/fusion.py,
// backend/services/base_service.py) and simply passed through as-is.

import type {
  AuditHistoryResponse,
  AuthenticateResponse,
  EnrollResponse,
  FusionAuthenticateResponse,
  FusionPolicy,
  Modality,
  ModalityMetricsResponse,
  RevokeResponse,
  SystemAuditResponse,
  SystemHealthResponse,
  UserModalitiesResponse,
} from './types'
import { ApiError } from './types'

export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, init)
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = body.detail ?? detail
    } catch {
      // Body wasn't JSON (e.g. a proxy error page) - keep statusText.
    }
    throw new ApiError(response.status, detail)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

function biometricForm(
  userId: string,
  applicationId: string,
  sample: Blob,
  filename: string,
  extra?: Record<string, string>,
): FormData {
  const form = new FormData()
  form.append('user_id', userId)
  form.append('application_id', applicationId)
  if (extra) {
    for (const [key, value] of Object.entries(extra)) form.append(key, value)
  }
  form.append('image', sample, filename)
  return form
}

export async function enroll(
  modality: Modality,
  userId: string,
  applicationId: string,
  sample: Blob,
  filename: string,
): Promise<EnrollResponse> {
  const form = biometricForm(userId, applicationId, sample, filename, { modality })
  return request<EnrollResponse>('/enroll', { method: 'POST', body: form })
}

export async function verify(
  modality: Modality,
  userId: string,
  applicationId: string,
  sample: Blob,
  filename: string,
): Promise<AuthenticateResponse> {
  const form = biometricForm(userId, applicationId, sample, filename)
  return request<AuthenticateResponse>(`/verify/${modality}`, { method: 'POST', body: form })
}

export interface FusionSample {
  modality: Modality
  sample: Blob
  filename: string
}

const FUSION_FIELD_NAME: Record<Modality, string> = {
  face: 'face_image',
  fingerprint: 'fingerprint_image',
  voice: 'voice_audio',
  iris: 'iris_image', // not accepted by the backend today; kept for type completeness
}

export async function authenticateFusion(
  userId: string,
  applicationId: string,
  samples: FusionSample[],
  options?: { fusionPolicy?: FusionPolicy; buildingId?: string; signal?: AbortSignal },
): Promise<FusionAuthenticateResponse> {
  const form = new FormData()
  form.append('user_id', userId)
  form.append('application_id', applicationId)
  if (options?.fusionPolicy) form.append('fusion_policy', options.fusionPolicy)
  if (options?.buildingId) form.append('building_id', options.buildingId)
  for (const { modality, sample, filename } of samples) {
    form.append(FUSION_FIELD_NAME[modality], sample, filename)
  }
  // `signal` is optional and passed straight through to fetch() (via
  // request()'s existing RequestInit parameter) - only the caller that wants
  // a client-side abort/timeout (AuthenticatePage.tsx) needs to pass one;
  // every other caller/endpoint is unaffected.
  return request<FusionAuthenticateResponse>('/authenticate/fusion', { method: 'POST', body: form, signal: options?.signal })
}

export async function revokeTemplate(
  modality: Modality,
  userId: string,
  applicationId: string,
  sample: Blob,
  filename: string,
): Promise<RevokeResponse> {
  const form = biometricForm(userId, applicationId, sample, filename, { modality })
  return request<RevokeResponse>('/revoke-template', { method: 'POST', body: form })
}

export async function getUser(userId: string): Promise<UserModalitiesResponse | null> {
  try {
    return await request<UserModalitiesResponse>(`/user/${encodeURIComponent(userId)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function getMetrics(modality: Modality): Promise<ModalityMetricsResponse> {
  return request<ModalityMetricsResponse>(`/metrics/${modality}`)
}

export async function getSystemHealth(): Promise<SystemHealthResponse | null> {
  try {
    return await request<SystemHealthResponse>('/system/health')
  } catch {
    return null
  }
}

export async function getUserAuditHistory(userId: string, limit = 20): Promise<AuditHistoryResponse | null> {
  try {
    return await request<AuditHistoryResponse>(`/audit/${encodeURIComponent(userId)}?limit=${limit}`)
  } catch (error) {
    if (error instanceof ApiError) return null
    throw error
  }
}

export async function getSystemAuditHistory(limit = 50): Promise<SystemAuditResponse | null> {
  try {
    return await request<SystemAuditResponse>(`/audit/system?limit=${limit}`)
  } catch (error) {
    if (error instanceof ApiError) return null
    throw error
  }
}

export async function deleteUserAuditHistory(userId: string): Promise<void> {
  await request<void>(`/audit/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}
