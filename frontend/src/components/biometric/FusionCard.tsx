import type { FusionAuthenticateResponse } from '../../api/types'
import { GlowingEffect } from '../ui/glowing-effect'
import { RadialGauge } from './RadialGauge'

export function FusionCard({ result }: { result: FusionAuthenticateResponse }) {
  return (
    <div className="relative rounded-xl border border-border bg-card/60 p-6 backdrop-blur">
      <GlowingEffect disabled={false} proximity={70} spread={28} borderWidth={1.5} />
      <p className="relative mb-5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Fusion Engine Report</p>

      <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
        <RadialGauge
          value={result.fused_score}
          label="Fused Score"
          colorVar={result.authenticated ? 'var(--color-success)' : 'var(--color-danger)'}
        />

        <dl className="grid w-full grid-cols-1 gap-3 font-mono text-xs sm:w-auto">
          <Row label="Fusion Policy" value={result.fusion_policy} />
          <Row label="Required" value={result.required_modalities.join(', ') || '-'} />
          <Row label="Matched" value={result.matched_modalities.join(', ') || 'none'} valueClass="text-success" />
          <Row
            label="Failed"
            value={result.failed_modalities.join(', ') || 'none'}
            valueClass={result.failed_modalities.length ? 'text-danger' : 'text-muted-foreground'}
          />
          <Row label="Fusion Threshold" value={result.fusion_threshold.toFixed(2)} />
          <Row
            label="Decision"
            value={result.authenticated ? 'AUTHENTICATED' : 'REJECTED'}
            valueClass={result.authenticated ? 'text-success' : 'text-danger'}
          />
        </dl>
      </div>
    </div>
  )
}

function Row({ label, value, valueClass = 'text-foreground' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border/50 pb-1.5">
      <dt className="text-muted-foreground uppercase">{label}</dt>
      <dd className={`text-right uppercase ${valueClass}`}>{value}</dd>
    </div>
  )
}
