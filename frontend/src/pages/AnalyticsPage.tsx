import { motion } from 'motion/react'
import { Activity, AlertTriangle, Building2, CheckCircle2, Clock, Fingerprint, Mic, ScanFace, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getSystemAuditHistory } from '../api/client'
import type { AuditLogEntry, Modality } from '../api/types'
import { getBuilding } from '../config/buildings'
import { useCountUp } from '../hooks/useCountUp'
import { GlowingEffect } from '../components/ui/glowing-effect'

const MODALITY_ICON: Record<string, typeof ScanFace> = { face: ScanFace, fingerprint: Fingerprint, voice: Mic }

function StatWidget({ icon: Icon, label, value, suffix = '' }: { icon: typeof Activity; label: string; value: number; suffix?: string }) {
  const animated = useCountUp(value, 1)
  return (
    <div className="relative rounded-xl border border-border bg-card/60 p-5">
      <GlowingEffect disabled={false} proximity={60} spread={24} borderWidth={1.5} />
      <div className="relative flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="font-mono text-[9px] tracking-wider text-muted-foreground uppercase">{label}</p>
          <p className="font-mono text-xl font-bold text-foreground">
            {animated.toFixed(suffix === '%' || suffix === 'ms' ? 0 : 0)}
            {suffix}
          </p>
        </div>
      </div>
    </div>
  )
}

export function AnalyticsPage() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    getSystemAuditHistory(200).then((result) => {
      if (result) setEntries(result.entries)
      else setError(true)
    })
  }, [])

  const stats = useMemo(() => {
    if (!entries) return null
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const today = entries.filter((e) => new Date(e.timestamp) >= todayStart)
    const successCount = entries.filter((e) => e.authenticated).length
    const failedCount = entries.length - successCount
    const avgLatency = entries.length ? Math.round(entries.reduce((sum, e) => sum + e.latency_ms, 0) / entries.length) : 0

    const modalityCounts: Partial<Record<Modality, number>> = {}
    for (const entry of entries) {
      for (const modality of entry.modality_list) {
        modalityCounts[modality] = (modalityCounts[modality] ?? 0) + 1
      }
    }
    const mostUsed: Modality | '-' = (Object.entries(modalityCounts) as [Modality, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-'

    const buildingCounts: Record<string, number> = {}
    for (const entry of entries) {
      if (entry.building_id) buildingCounts[entry.building_id] = (buildingCounts[entry.building_id] ?? 0) + 1
    }
    const recentBuildings = Object.entries(buildingCounts).sort((a, b) => b[1] - a[1])

    const recentUsers = [...new Set(entries.map((e) => e.user_id))].slice(0, 8)

    return {
      todayCount: today.length,
      successRate: entries.length ? Math.round((successCount / entries.length) * 100) : 0,
      failedCount,
      avgLatency,
      mostUsed,
      recentBuildings,
      recentUsers,
    }
  }, [entries])

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <p className="mb-2 font-mono text-xs tracking-[0.25em] text-primary uppercase">Security Analytics</p>
      <h1 className="mb-8 text-2xl font-semibold text-foreground">Operational Intelligence Dashboard</h1>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Backend unreachable - live audit data cannot be loaded.
        </div>
      )}

      {!error && !entries && <div className="h-40 animate-pulse rounded-xl border border-border bg-card/40" />}

      {stats && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatWidget icon={Clock} label="Today's Attempts" value={stats.todayCount} />
            <StatWidget icon={CheckCircle2} label="Success Rate" value={stats.successRate} suffix="%" />
            <StatWidget icon={AlertTriangle} label="Failed Attempts" value={stats.failedCount} />
            <StatWidget icon={Activity} label="Avg Latency" value={stats.avgLatency} suffix="ms" />
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="relative rounded-xl border border-border bg-card/60 p-5">
              <GlowingEffect disabled={false} proximity={60} spread={24} borderWidth={1.5} />
              <p className="relative mb-3 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Most-Used Modality</p>
              <div className="relative flex items-center gap-3">
                {(() => {
                  const Icon = MODALITY_ICON[stats.mostUsed]
                  return Icon ? <Icon className="h-8 w-8 text-primary" /> : null
                })()}
                <span className="font-mono text-lg font-semibold text-foreground uppercase">{stats.mostUsed}</span>
              </div>
            </div>

            <div className="relative rounded-xl border border-border bg-card/60 p-5">
              <GlowingEffect disabled={false} proximity={60} spread={24} borderWidth={1.5} />
              <p className="relative mb-3 flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                <Building2 className="h-3 w-3" /> Recent Facilities
              </p>
              <ul className="relative space-y-1.5">
                {stats.recentBuildings.length === 0 && <li className="text-xs text-muted-foreground">No facility-tagged attempts yet.</li>}
                {stats.recentBuildings.map(([id, count]) => (
                  <li key={id} className="flex items-center justify-between font-mono text-xs">
                    <span className="text-foreground">{getBuilding(id)?.name ?? id}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mb-8 relative rounded-xl border border-border bg-card/60 p-5">
            <GlowingEffect disabled={false} proximity={60} spread={24} borderWidth={1.5} />
            <p className="relative mb-3 flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              <Users className="h-3 w-3" /> Recent Operators
            </p>
            <div className="relative flex flex-wrap gap-2">
              {stats.recentUsers.map((user) => (
                <span key={user} className="rounded-full border border-border bg-muted px-3 py-1 font-mono text-[10px] text-muted-foreground">
                  {user}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">Audit Activity</p>
            <div className="overflow-x-auto rounded-xl border border-border bg-card/60">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-4 py-2 font-mono font-normal uppercase">Time</th>
                    <th className="px-4 py-2 font-mono font-normal uppercase">User</th>
                    <th className="px-4 py-2 font-mono font-normal uppercase">Facility</th>
                    <th className="px-4 py-2 font-mono font-normal uppercase">Factors</th>
                    <th className="px-4 py-2 font-mono font-normal uppercase">Decision</th>
                    <th className="px-4 py-2 font-mono font-normal uppercase">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {entries!.slice(0, 20).map((entry, i) => (
                    <motion.tr
                      key={entry.audit_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-border/50 text-muted-foreground"
                    >
                      <td className="px-4 py-2 font-mono">{new Date(entry.timestamp).toLocaleTimeString()}</td>
                      <td className="px-4 py-2 font-mono">{entry.user_id}</td>
                      <td className="px-4 py-2">{entry.building_id ? (getBuilding(entry.building_id)?.name ?? entry.building_id) : '-'}</td>
                      <td className="px-4 py-2">{entry.modality_list.join(' + ')}</td>
                      <td className={`px-4 py-2 font-mono ${entry.authenticated ? 'text-success' : 'text-danger'}`}>
                        {entry.authenticated ? 'GRANTED' : 'DENIED'}
                      </td>
                      <td className="px-4 py-2 font-mono">{entry.latency_ms}ms</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              {entries!.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No authentication attempts recorded yet.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
