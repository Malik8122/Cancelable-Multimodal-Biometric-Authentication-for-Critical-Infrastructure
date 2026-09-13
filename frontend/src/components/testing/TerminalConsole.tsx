import { motion } from 'motion/react'
import { useState } from 'react'
import { authenticateFusion, BASE_URL, enroll, getMetrics, verify } from '../../api/client'
import { syntheticFingerprintPng, syntheticToneWav } from '../../utils/syntheticSamples'

const APPLICATION_ID = 'ncisn-security-network-testcases'

interface TestCase {
  id: string
  command: string
  description: string
  run: () => Promise<{ pass: boolean; detail: string }>
}

function freshUserId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

const TEST_CASES: TestCase[] = [
  {
    id: 'fingerprint-roundtrip',
    command: 'POST /enroll && POST /verify/fingerprint',
    description: 'Fingerprint: enroll then verify (same sample, real checkpoint)',
    run: async () => {
      const userId = freshUserId('TC-FP')
      const png = await syntheticFingerprintPng()
      await enroll('fingerprint', userId, APPLICATION_ID, png, 'fp.png')
      const result = await verify('fingerprint', userId, APPLICATION_ID, png, 'fp.png')
      return {
        pass: result.authenticated && result.score >= result.threshold,
        detail: `score=${result.score.toFixed(4)} threshold=${result.threshold} distance=${result.distance.toFixed(4)}`,
      }
    },
  },
  {
    id: 'voice-roundtrip',
    command: 'POST /enroll && POST /verify/voice',
    description: 'Voice: enroll then verify (same sample, real ECAPA-TDNN checkpoint)',
    run: async () => {
      const userId = freshUserId('TC-VC')
      const wav = syntheticToneWav()
      await enroll('voice', userId, APPLICATION_ID, wav, 'voice.wav')
      const result = await verify('voice', userId, APPLICATION_ID, wav, 'voice.wav')
      return {
        pass: result.authenticated && result.score >= result.threshold,
        detail: `score=${result.score.toFixed(4)} threshold=${result.threshold} distance=${result.distance.toFixed(4)}`,
      }
    },
  },
  {
    id: 'voice-no-enrollment',
    command: 'POST /verify/voice (never enrolled)',
    description: 'Fails closed: never-enrolled user gets score=0.0, not an error',
    run: async () => {
      const userId = freshUserId('TC-NEW')
      const wav = syntheticToneWav()
      const result = await verify('voice', userId, APPLICATION_ID, wav, 'voice.wav')
      return { pass: !result.authenticated && result.score === 0, detail: `score=${result.score} authenticated=${result.authenticated}` }
    },
  },
  {
    id: 'fusion-all-required',
    command: 'POST /authenticate/fusion (policy=ALL_REQUIRED)',
    description: 'Fusion: fingerprint + voice, both genuine, ALL_REQUIRED default',
    run: async () => {
      const userId = freshUserId('TC-FU')
      const png = await syntheticFingerprintPng()
      const wav = syntheticToneWav()
      await enroll('fingerprint', userId, APPLICATION_ID, png, 'fp.png')
      await enroll('voice', userId, APPLICATION_ID, wav, 'voice.wav')
      const result = await authenticateFusion(userId, APPLICATION_ID, [
        { modality: 'fingerprint', sample: png, filename: 'fp.png' },
        { modality: 'voice', sample: wav, filename: 'voice.wav' },
      ])
      return {
        pass: result.authenticated && result.fusion_policy === 'ALL_REQUIRED' && result.matched_modalities.length === 2,
        detail: `fused_score=${result.fused_score.toFixed(4)} policy=${result.fusion_policy} matched=[${result.matched_modalities}]`,
      }
    },
  },
  {
    id: 'metrics-honesty',
    command: 'GET /metrics/iris',
    description: 'Unavailable modality reports honestly (available=false, not fabricated)',
    run: async () => {
      const result = await getMetrics('iris')
      return { pass: result.available === false, detail: `available=${result.available}` }
    },
  },
  {
    id: 'invalid-modality',
    command: 'GET /metrics/retina',
    description: 'Invalid modality is rejected with 422, not silently accepted',
    run: async () => {
      const response = await fetch(`${BASE_URL}/metrics/retina`)
      return { pass: response.status === 422, detail: `status=${response.status}` }
    },
  },
]

type Outcome = { pass: boolean; detail: string; latencyMs: number } | { error: string }

export function TerminalConsole() {
  const [results, setResults] = useState<Record<string, Outcome>>({})
  const [running, setRunning] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>(['NCISN diagnostic console ready. Every command below hits the live backend.'])

  const appendLog = (line: string) => setLog((prev) => [...prev, line])

  const runOne = async (testCase: TestCase) => {
    setRunning(testCase.id)
    appendLog(`$ ${testCase.command}`)
    const startedAt = performance.now()
    try {
      const outcome = await testCase.run()
      const latencyMs = Math.round(performance.now() - startedAt)
      setResults((prev) => ({ ...prev, [testCase.id]: { ...outcome, latencyMs } }))
      appendLog(`  ${outcome.pass ? 'PASS' : 'FAIL'} (${latencyMs}ms) - ${outcome.detail}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed'
      setResults((prev) => ({ ...prev, [testCase.id]: { error: message } }))
      appendLog(`  ERROR - ${message}`)
    } finally {
      setRunning(null)
    }
  }

  const runAll = async () => {
    appendLog('$ run-all --suite=ncisn')
    for (const testCase of TEST_CASES) await runOne(testCase)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-black">
      <div className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          <span className="ml-2 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            security-diagnostics.terminal
          </span>
        </div>
        <button
          onClick={runAll}
          disabled={running !== null}
          className="rounded border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-[10px] tracking-wide text-primary uppercase transition-colors hover:bg-primary/20 disabled:opacity-40"
        >
          Run All
        </button>
      </div>

      <div className="max-h-56 overflow-y-auto border-b border-border p-4 font-mono text-[11px] leading-relaxed text-success/90">
        {log.map((line, i) => (
          <div key={i} className={line.startsWith('$') ? 'text-primary' : line.includes('FAIL') || line.includes('ERROR') ? 'text-danger' : ''}>
            {line}
          </div>
        ))}
      </div>

      <ul className="divide-y divide-border">
        {TEST_CASES.map((testCase) => {
          const outcome = results[testCase.id]
          return (
            <li key={testCase.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{testCase.description}</p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">{testCase.command}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {outcome && 'latencyMs' in outcome && (
                  <span className="font-mono text-[10px] text-muted-foreground">{outcome.latencyMs}ms</span>
                )}
                <StatusPill running={running === testCase.id} outcome={outcome} />
                <button
                  onClick={() => runOne(testCase)}
                  disabled={running !== null}
                  className="rounded border border-border px-2.5 py-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-40"
                >
                  Run
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function StatusPill({ running, outcome }: { running: boolean; outcome: Outcome | undefined }) {
  if (running) {
    return (
      <motion.span
        animate={{ opacity: [1, 0.4, 1] }}
        transition={{ duration: 0.8, repeat: Infinity }}
        className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[9px] tracking-wider text-primary uppercase"
      >
        Running
      </motion.span>
    )
  }
  if (!outcome) {
    return (
      <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
        Idle
      </span>
    )
  }
  if ('error' in outcome) {
    return (
      <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 font-mono text-[9px] tracking-wider text-danger uppercase">
        Error
      </span>
    )
  }
  return outcome.pass ? (
    <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 font-mono text-[9px] tracking-wider text-success uppercase">
      Pass
    </span>
  ) : (
    <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 font-mono text-[9px] tracking-wider text-danger uppercase">
      Fail
    </span>
  )
}
