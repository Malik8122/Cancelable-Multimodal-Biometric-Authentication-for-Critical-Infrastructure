import { motion } from 'motion/react'
import { Mic, RotateCcw, Square, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useWavRecorder } from '../../hooks/useWavRecorder'
import { GlowingEffect } from '../ui/glowing-effect'

interface Props {
  mode: 'register' | 'verify'
  onCapture: (blob: Blob, filename: string) => void
  disabled?: boolean
}

const BAR_COUNT = 32

const ENROLLMENT_PHRASES = [
  'My voice is my secure biometric identity.',
  'Access granted only through authenticated identity.',
  'Secure authentication protects critical infrastructure.',
]

export function VoiceCapture({ mode, onCapture, disabled }: Props) {
  const { state, error, start, stop } = useWavRecorder()
  const [seconds, setSeconds] = useState(0)
  const [captured, setCaptured] = useState(false)
  const reducedMotion = useReducedMotion()
  const timerRef = useRef<number | null>(null)
  const phrase = useMemo(() => ENROLLMENT_PHRASES[Math.floor(Math.random() * ENROLLMENT_PHRASES.length)], [])

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
    <div className="relative rounded-2xl border border-border bg-card/60 p-6 backdrop-blur">
      <GlowingEffect disabled={false} proximity={80} spread={30} borderWidth={2} />
      <div className="relative mb-4 flex items-center justify-between text-muted-foreground">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary" />
          <span className="font-mono text-xs tracking-[0.15em] uppercase">
            {mode === 'register' ? 'Voice Registration' : 'Verify Voice'}
          </span>
        </div>
        {isRecording && (
          <motion.span
            className="flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-danger uppercase"
            animate={reducedMotion ? undefined : { opacity: [1, 0.4, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-danger" />
            Rec {seconds}s
          </motion.span>
        )}
      </div>

      <div className="relative mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <p className="font-mono text-[9px] tracking-wider text-primary/70 uppercase">Speak this phrase</p>
        <p className="mt-1 text-sm text-foreground italic">&ldquo;{phrase}&rdquo;</p>
      </div>

      <motion.div
        className="relative mb-4 flex aspect-video items-center justify-center gap-1 rounded-xl border bg-black"
        animate={{ borderColor: isRecording ? 'var(--color-danger)' : 'var(--color-border)' }}
      >
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <motion.div
            key={i}
            className={`w-1 rounded-full ${isRecording ? 'bg-primary' : captured ? 'bg-success/50' : 'bg-border'}`}
            animate={
              isRecording && !reducedMotion
                ? { height: [4, 4 + ((i * 7) % 40) + 6, 4] }
                : { height: captured ? 6 + ((i * 13) % 24) : 4 }
            }
            transition={{ duration: 0.5 + (i % 5) * 0.08, repeat: isRecording ? Infinity : 0 }}
          />
        ))}
      </motion.div>

      {error && <p className="relative mb-3 text-xs text-danger">{error}</p>}

      <p className="relative mb-4 text-[11px] leading-relaxed text-muted-foreground">
        Speak naturally in a quiet room &middot; record for approximately 4 seconds &middot; maintain normal speaking speed.
      </p>

      <div className="relative flex gap-2">
        {captured ? (
          <button
            onClick={reRecord}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-muted py-2.5 font-mono text-xs tracking-wide text-foreground uppercase transition-colors hover:border-primary/50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Re-record
          </button>
        ) : !isRecording ? (
          <motion.button
            onClick={handleStart}
            disabled={disabled || state === 'processing'}
            whileTap={disabled || state === 'processing' ? undefined : { scale: 0.96 }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-mono text-xs tracking-wide text-primary-foreground uppercase shadow-[0_0_20px_color-mix(in_srgb,var(--color-primary)_40%,transparent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Mic className="h-3.5 w-3.5" />
            {state === 'processing' ? 'Processing...' : 'Start Recording'}
          </motion.button>
        ) : (
          <motion.button
            onClick={handleStop}
            whileTap={{ scale: 0.96 }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-danger py-2.5 font-mono text-xs tracking-wide text-danger-foreground uppercase"
          >
            <Square className="h-3.5 w-3.5" />
            Stop Recording
          </motion.button>
        )}
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 font-mono text-xs tracking-wide text-muted-foreground uppercase transition-colors hover:border-primary/50 hover:text-foreground">
          <Upload className="h-3.5 w-3.5" />
          Upload
          <input
            type="file"
            accept="audio/wav,audio/x-wav,audio/wave"
            className="hidden"
            disabled={disabled || isRecording}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      </div>
      <p className="relative mt-2 text-center font-mono text-[9px] tracking-wider text-muted-foreground/70 uppercase">
        Microphone preferred &middot; upload fallback: WAV, 16 kHz mono
      </p>
    </div>
  )
}
