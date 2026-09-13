import { useEffect, useState } from 'react'
import { getMetrics, getSystemAuditHistory } from '../../api/client'
import type { Modality } from '../../api/types'
import { useSession } from '../../context/SessionContext'
import { RadialGauge } from '../biometric/RadialGauge'

// Every number here is real (derived from GET /system/health, GET /metrics/*,
// GET /audit/system) - none of it is a fabricated "threat level" or invented
// security-theater statistic.
export function HUDCornerWidgets() {
  const { health } = useSession()
  const [avgAccuracy, setAvgAccuracy] = useState<number | null>(null)
  const [sessionsToday, setSessionsToday] = useState<number | null>(null)

  useEffect(() => {
    Promise.all((['face', 'fingerprint', 'voice'] as Modality[]).map((m) => getMetrics(m))).then((results) => {
      const values = results.map((r) => r.metrics.accuracy).filter((v): v is number => v !== undefined)
      if (values.length) setAvgAccuracy(values.reduce((a, b) => a + b, 0) / values.length)
    })
    getSystemAuditHistory(500).then((result) => {
      if (!result) return
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      setSessionsToday(result.entries.filter((e) => new Date(e.timestamp) >= todayStart).length)
    })
  }, [])

  const systemUp = health?.backend === 'online'
  const calibrated = !!health?.thresholds_loaded

  return (
    <>
      <div className="pointer-events-auto absolute top-4 left-4 flex flex-col items-start gap-1 sm:top-6 sm:left-6">
        <RadialGauge value={systemUp ? 1 : 0} label="System Status" size={92} colorVar={systemUp ? 'var(--color-success)' : 'var(--color-danger)'} />
      </div>

      <div className="pointer-events-auto absolute top-4 right-4 flex flex-col items-end gap-1 sm:top-6 sm:right-6">
        <RadialGauge
          value={calibrated ? 1 : 0.5}
          label="Threshold Calibration"
          size={92}
          colorVar={calibrated ? 'var(--color-success)' : 'var(--color-warning)'}
        />
      </div>

      <div className="pointer-events-auto absolute bottom-4 left-4 sm:bottom-6 sm:left-6">
        {avgAccuracy !== null ? (
          <RadialGauge value={avgAccuracy} label="Avg Model Accuracy" size={92} />
        ) : (
          <div className="h-[92px] w-[92px] animate-pulse rounded-full border border-border" />
        )}
      </div>

      <div className="pointer-events-auto absolute right-4 bottom-4 rounded-xl border border-border bg-card/80 px-4 py-3 text-right backdrop-blur sm:right-6 sm:bottom-6">
        <p className="font-mono text-2xl font-bold text-foreground">{sessionsToday ?? '-'}</p>
        <p className="font-mono text-[9px] tracking-wider text-muted-foreground uppercase">Sessions Today</p>
      </div>
    </>
  )
}
