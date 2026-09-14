import { motion } from 'motion/react'
import { Mic, RotateCcw, Square, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useWavRecorder } from '../../hooks/useWavRecorder'

interface Props {
  mode: 'register' | 'verify'
  onCapture: (blob: Blob, filename: string) => void
  disabled?: boolean
}

const BAR_COUNT = 28
const ENROLLMENT_PHRASE = 'My voice is my secure biometric identity.'

export function VoiceCapture({ mode, onCapture, disabled }: Props) {
  const { state, error, start, stop } = useWavRecorder()
  const [seconds, setSeconds] = useState(0)
  const [captured, setCaptured] = useState(false)
  const reducedMotion = useReducedMotion()
  const timerRef = useRef<number | null>(null)

  const isRecording = state === 'recording'

  const handleStart = async () => {
    setSeconds(0)
    setCaptured(false)
    await start()
    timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
  }

  const handleStop = async () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    const blob = await stop()
    if (blob) {
      onCapture(blob, 'voice.wav')
      setCaptured(true)
    }
  }

  const handleFile = (file: File) => {
    onCapture(file, file.name)
    setCaptured(true)
  }

  const reRecord = () => setCaptured(false)

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between text-foreground">
        <div className="flex items-center gap-2.5">
          <Mic className="h-4.5 w-4.5 text-primary" strokeWidth={1.5} />
          <span className="text-sm font-medium">{mode === 'register' ? 'Voice Capture' : 'Verify Voice'}</span>
        </div>
        {isRecording && (
          <motion.span
            className="flex items-center gap-1.5 text-xs font-medium text-danger"
            animate={reducedMotion ? undefined : { opacity: [1, 0.4, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-danger" />
            {seconds}s
          </motion.span>
        )}
      </div>

      <div className="mb-3 rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2">
        <p className="text-[11px] text-muted-foreground">Speak this phrase</p>
        <p className="text-sm text-foreground italic">&ldquo;{ENROLLMENT_PHRASE}&rdquo;</p>
      </div>

      <motion.div
        className="mb-4 flex h-20 items-center justify-center gap-1 rounded-xl border bg-black/40"
        animate={{ borderColor: isRecording ? 'var(--color-danger)' : 'var(--color-border)' }}
      >
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <motion.div
            key={i}
            className={`w-1 rounded-full ${isRecording ? 'bg-primary' : captured ? 'bg-success/50' : 'bg-white/15'}`}
            animate={
              isRecording && !reducedMotion
                ? { height: [4, 4 + ((i * 7) % 40) + 6, 4] }
                : { height: captured ? 6 + ((i * 13) % 24) : 4 }
            }
            transition={{ duration: 0.5 + (i % 5) * 0.08, repeat: isRecording ? Infinity : 0 }}
          />
        ))}
      </motion.div>

      {error && <p className="mb-3 text-xs text-danger">{error}</p>}

      <p className="mb-5 text-[13px] leading-relaxed text-muted-foreground">
        Speak naturally in a quiet room. Record for approximately 4 seconds at a normal speaking pace.
      </p>

      <div className="flex gap-2.5">
        {captured ? (
          <button
            onClick={reRecord}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:border-white/25"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
            Re-record
          </button>
        ) : !isRecording ? (
          <button
            onClick={handleStart}
            disabled={disabled || state === 'processing'}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow-md shadow-black/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Mic className="h-4 w-4" strokeWidth={1.5} />
            {state === 'processing' ? 'Processing...' : 'Start Recording'}
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-danger py-2.5 text-sm font-medium text-danger-foreground"
          >
            <Square className="h-4 w-4" strokeWidth={1.5} />
            Stop Recording
          </button>
        )}
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground">
          <Upload className="h-4 w-4" strokeWidth={1.5} />
          Upload WAV
          <input
            type="file"
            accept="audio/wav,audio/x-wav,audio/wave"
            className="hidden"
            disabled={disabled || isRecording}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground/70">Accepted format: 16 kHz WAV</p>
    </div>
  )
}
