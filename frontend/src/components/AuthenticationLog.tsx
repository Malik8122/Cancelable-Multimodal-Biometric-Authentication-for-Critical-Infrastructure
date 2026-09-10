import type { PerformanceLogEntry } from '../hooks/useAuthSession'

export function AuthenticationLog({ entries }: { entries: PerformanceLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-text-dim">No attempts recorded yet this session.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border text-text-dim">
            <th className="py-2 pr-4 font-mono font-normal uppercase">Time</th>
            <th className="py-2 pr-4 font-mono font-normal uppercase">Factors</th>
            <th className="py-2 pr-4 font-mono font-normal uppercase">Fused score</th>
            <th className="py-2 pr-4 font-mono font-normal uppercase">Decision</th>
            <th className="py-2 font-mono font-normal uppercase">Latency</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-border/50 text-text-muted">
              <td className="py-2 pr-4 font-mono">{new Date(entry.timestamp).toLocaleTimeString()}</td>
              <td className="py-2 pr-4">{entry.modalitiesUsed.join(' + ')}</td>
              <td className="py-2 pr-4 font-mono">{entry.fusedScore.toFixed(4)}</td>
              <td className={`py-2 pr-4 font-mono ${entry.authenticated ? 'text-success' : 'text-danger'}`}>
                {entry.authenticated ? 'GRANTED' : 'DENIED'}
              </td>
              <td className="py-2 font-mono">{entry.latencyMs}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
