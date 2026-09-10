import { CheckCircle2, Loader2, PlayCircle, XCircle } from 'lucide-react'
import { useState } from 'react'
import { authenticateFusion, BASE_URL, enroll, getMetrics, verify } from '../api/client'
import { syntheticFingerprintPng, syntheticToneWav } from '../utils/syntheticSamples'

const APPLICATION_ID = 'biometric-dashboard-testcases'

interface TestCase {
  id: string
  name: string
  description: string
  run: () => Promise<{ pass: boolean; detail: string }>
}

function freshUserId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

const TEST_CASES: TestCase[] = [
  {
    id: 'fingerprint-roundtrip',
    name: 'Fingerprint: enroll then verify (same sample)',
    description: 'Real checkpoint, real HTTP calls. Expects authenticated=true, score >= threshold.',
    run: async () => {
      const userId = freshUserId('TC-FP')
      const png = await syntheticFingerprintPng()
      await enroll('fingerprint', userId, APPLICATION_ID, png, 'fp.png')
      const result = await verify('fingerprint', userId, APPLICATION_ID, png, 'fp.png')
      return {
        pass: result.authenticated && result.score >= result.threshold,
        detail: `score=${result.score.toFixed(4)} threshold=${result.threshold} authenticated=${result.authenticated}`,
      }
    },
  },
  {
    id: 'voice-roundtrip',
    name: 'Voice: enroll then verify (same sample)',
    description: 'Real checkpoint, real HTTP calls. Expects authenticated=true, score >= threshold.',
    run: async () => {
      const userId = freshUserId('TC-VC')
      const wav = syntheticToneWav()
      await enroll('voice', userId, APPLICATION_ID, wav, 'voice.wav')
      const result = await verify('voice', userId, APPLICATION_ID, wav, 'voice.wav')
      return {
        pass: result.authenticated && result.score >= result.threshold,
        detail: `score=${result.score.toFixed(4)} threshold=${result.threshold} authenticated=${result.authenticated}`,
      }
    },
  },
  {
    id: 'voice-no-enrollment',
    name: 'Voice: authenticate without enrollment fails closed',
    description: 'A never-enrolled user_id must get score=0.0, authenticated=false - not an error.',
    run: async () => {
      const userId = freshUserId('TC-NEW')
      const wav = syntheticToneWav()
      const result = await verify('voice', userId, APPLICATION_ID, wav, 'voice.wav')
      return {
        pass: !result.authenticated && result.score === 0,
        detail: `score=${result.score} authenticated=${result.authenticated}`,
      }
    },
  },
  {
    id: 'fusion-two-factor',
    name: 'Fusion: fingerprint + voice',
    description: 'Enrolls both, then authenticates via /authenticate/fusion. Expects authenticated=true.',
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
        pass: result.authenticated && result.modalities_used.length === 2,
        detail: `fused_score=${result.fused_score.toFixed(4)} authenticated=${result.authenticated}`,
      }
    },
  },
  {
    id: 'metrics-honesty',
    name: 'Metrics: unavailable modality reports honestly',
    description: 'GET /metrics/iris must return available=false, not fabricated numbers.',
    run: async () => {
      const result = await getMetrics('iris')
      return { pass: result.available === false, detail: `available=${result.available}` }
    },
  },
  {
    id: 'invalid-modality',
    name: 'Invalid modality is rejected (422)',
    description: 'GET /metrics/retina should be rejected, not silently accepted.',
    run: async () => {
      const response = await fetch(`${BASE_URL}/metrics/retina`)
      return { pass: response.status === 422, detail: `status=${response.status}` }
    },
  },
]

type Outcome = { pass: boolean; detail: string } | { error: string }

export function TestCaseTable() {
  const [results, setResults] = useState<Record<string, Outcome>>({})
  const [running, setRunning] = useState<string | null>(null)

  const runOne = async (testCase: TestCase) => {
    setRunning(testCase.id)
    try {
      const outcome = await testCase.run()
      setResults((prev) => ({ ...prev, [testCase.id]: outcome }))
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [testCase.id]: { error: err instanceof Error ? err.message : 'Request failed' },
      }))
    } finally {
      setRunning(null)
    }
  }

  const runAll = async () => {
    for (const testCase of TEST_CASES) await runOne(testCase)
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-[10px] tracking-wider text-text-dim uppercase">
          Real backend test cases - no fabricated results
        </p>
        <button
          onClick={runAll}
          disabled={running !== null}
          className="rounded border border-border px-3 py-1 font-mono text-[10px] tracking-wide text-text-muted uppercase transition-colors hover:border-border-bright hover:text-text disabled:opacity-40"
        >
          Run all
        </button>
      </div>
      <ul className="space-y-3">
        {TEST_CASES.map((testCase) => {
          const outcome = results[testCase.id]
          return (
            <li key={testCase.id} className="flex items-start gap-3 border-b border-border/50 pb-3 last:border-0">
              <button
                onClick={() => runOne(testCase)}
                disabled={running !== null}
                className="mt-0.5 shrink-0 text-text-muted transition-colors hover:text-accent disabled:opacity-40"
              >
                {running === testCase.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : outcome && 'pass' in outcome ? (
                  outcome.pass ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <XCircle className="h-4 w-4 text-danger" />
                  )
                ) : outcome && 'error' in outcome ? (
                  <XCircle className="h-4 w-4 text-danger" />
                ) : (
                  <PlayCircle className="h-4 w-4" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text">{testCase.name}</p>
                <p className="text-xs text-text-dim">{testCase.description}</p>
                {outcome && (
                  <p className={`mt-1 font-mono text-[10px] ${'pass' in outcome && outcome.pass ? 'text-success' : 'text-danger'}`}>
                    {'error' in outcome ? outcome.error : outcome.detail}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
