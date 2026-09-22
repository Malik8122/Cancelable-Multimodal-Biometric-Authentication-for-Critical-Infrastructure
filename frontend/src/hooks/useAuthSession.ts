import { useCallback, useEffect, useState } from 'react'
import { getSystemHealth } from '../api/client'
import type { Modality, SystemHealthResponse } from '../api/types'

const USER_ID_KEY = 'biometric-demo.user-id'
const KNOWN_USERS_KEY = 'biometric-demo.known-users'
const LOG_KEY = 'biometric-demo.performance-log'

// A local, per-browser demo identity - not a real account system. Lets the
// same visitor's enroll-then-authenticate flow work across page reloads
// without a login step, which is out of scope for this project (see
// docs/BACKEND_API.md's "Scope note: 'auth' here means biometric
// verification").
//
// `knownUsers` is a purely local (this-browser-only) roster of user_ids this session has seen -
// NOT a backend concept. The backend has no "list users" endpoint (only GET /user/{id} for an ID
// the caller already knows - see backend/api/user.py), so this lets more than one person use the
// same browser/machine without either overwriting the other's enrollment or requiring a backend
// change: every id in the roster is a real backend user_id, checked via the existing
// GET /user/{id}/enrollment-status the same way the single-user flow already did.
function createUserId(): string {
  return `OPERATOR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function loadOrCreateUserId(): string {
  const existing = localStorage.getItem(USER_ID_KEY)
  if (existing) return existing
  const created = createUserId()
  localStorage.setItem(USER_ID_KEY, created)
  return created
}

function loadKnownUsers(currentUserId: string): string[] {
  try {
    const raw = localStorage.getItem(KNOWN_USERS_KEY)
    const parsed: string[] = raw ? JSON.parse(raw) : []
    return parsed.includes(currentUserId) ? parsed : [...parsed, currentUserId]
  } catch {
    return [currentUserId]
  }
}

export interface PerformanceLogEntry {
  id: string
  timestamp: string
  buildingId: string
  modalitiesUsed: Modality[]
  fusionSimilarity: number
  fusionThreshold: number
  authenticated: boolean
  latencyMs: number
}

function loadLog(): PerformanceLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    return raw ? (JSON.parse(raw) as PerformanceLogEntry[]) : []
  } catch {
    return []
  }
}

/**
 * Session identity, a local (this-browser-only) quick-access performance
 * log for the Result page's session timeline, and live `GET /system/health`
 * polling. Real, durable audit history lives server-side now (Phase 2.5's
 * AuditLog table, via api/client.ts's getUserAuditHistory/getSystemHealth) -
 * this local log is just a fast, no-round-trip convenience, not the source
 * of truth the Analytics page uses.
 */
export function useAuthSession() {
  const [userId, setUserId] = useState(loadOrCreateUserId)
  const [knownUsers, setKnownUsers] = useState<string[]>(() => loadKnownUsers(userId))
  const [log, setLog] = useState<PerformanceLogEntry[]>(loadLog)
  const [health, setHealth] = useState<SystemHealthResponse | null>(null)
  const [healthChecked, setHealthChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      const result = await getSystemHealth()
      if (!cancelled) {
        setHealth(result)
        setHealthChecked(true)
      }
    }
    poll()
    const interval = setInterval(poll, 15_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const recordAttempt = useCallback((entry: Omit<PerformanceLogEntry, 'id' | 'timestamp'>) => {
    setLog((prev) => {
      const next = [
        { ...entry, id: crypto.randomUUID(), timestamp: new Date().toISOString() },
        ...prev,
      ].slice(0, 200)
      localStorage.setItem(LOG_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const clearLog = useCallback(() => {
    setLog([])
    localStorage.removeItem(LOG_KEY)
  }, [])

  // Switch the active session to an already-known user_id (e.g. from the "Registered User"
  // dropdown) - never creates anything, never touches any template, purely a local pointer change.
  const switchUser = useCallback((id: string) => {
    setUserId(id)
    localStorage.setItem(USER_ID_KEY, id)
    setKnownUsers((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      localStorage.setItem(KNOWN_USERS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  // "+ New Registration": a brand-new, distinct user_id for a different person to enroll under -
  // added to the local roster and made active, but every existing id (and its enrollment) in
  // `knownUsers` is left completely untouched. Returns the new id so the caller can navigate to
  // the registration flow for it.
  const registerNewUser = useCallback(() => {
    const created = createUserId()
    setUserId(created)
    localStorage.setItem(USER_ID_KEY, created)
    setKnownUsers((prev) => {
      const next = [...prev, created]
      localStorage.setItem(KNOWN_USERS_KEY, JSON.stringify(next))
      return next
    })
    return created
  }, [])

  return {
    userId,
    knownUsers,
    switchUser,
    registerNewUser,
    log,
    recordAttempt,
    clearLog,
    health,
    backendOnline: healthChecked ? health !== null : null,
  }
}
