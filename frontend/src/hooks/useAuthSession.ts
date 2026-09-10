import { useCallback, useEffect, useState } from 'react'
import { checkHealth } from '../api/client'
import type { FusionAuthenticateResponse, Modality } from '../api/types'

const USER_ID_KEY = 'biometric-demo.user-id'
const LOG_KEY = 'biometric-demo.performance-log'

// A local, per-browser demo identity - not a real account system. Lets the
// same visitor's enroll-then-authenticate flow work across page reloads
// without a login step, which is out of scope for this project (see
// docs/BACKEND_API.md's "Scope note: 'auth' here means biometric
// verification").
function loadOrCreateUserId(): string {
  const existing = localStorage.getItem(USER_ID_KEY)
  if (existing) return existing
  const created = `DEMO-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
  localStorage.setItem(USER_ID_KEY, created)
  return created
}

export interface PerformanceLogEntry {
  id: string
  timestamp: string
  buildingId: string
  modalitiesUsed: Modality[]
  fusedScore: number
  fusionThreshold: number
  authenticated: boolean
  latencyMs: number
  perModality: FusionAuthenticateResponse['results']
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
 * Session identity, a local (this-browser-only) performance/audit log, and
 * live backend reachability. The log is explicitly a client-side demo
 * artifact - there is no server-side audit-log table (see
 * docs/ROADMAP.md); it records the *real* responses the backend already
 * returned, it doesn't compute anything new.
 */
export function useAuthSession() {
  const [userId] = useState(loadOrCreateUserId)
  const [log, setLog] = useState<PerformanceLogEntry[]>(loadLog)
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      const online = await checkHealth()
      if (!cancelled) setBackendOnline(online)
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

  return { userId, log, recordAttempt, clearLog, backendOnline }
}
