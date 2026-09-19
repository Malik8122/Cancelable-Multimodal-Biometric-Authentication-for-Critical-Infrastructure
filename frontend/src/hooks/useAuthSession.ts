import { useCallback, useEffect, useState } from 'react'
import { getSystemHealth } from '../api/client'
import type { Modality, SystemHealthResponse } from '../api/types'

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
  const created = `OPERATOR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  localStorage.setItem(USER_ID_KEY, created)
  return created
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
  const [userId] = useState(loadOrCreateUserId)
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

  return {
    userId,
    log,
    recordAttempt,
    clearLog,
    health,
    backendOnline: healthChecked ? health !== null : null,
  }
}
