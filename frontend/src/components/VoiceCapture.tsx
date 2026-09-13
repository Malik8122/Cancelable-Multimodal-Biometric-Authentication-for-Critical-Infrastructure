import { motion } from 'framer-motion'
import { Mic, Square, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useWavRecorder } from '../hooks/useWavRecorder'

interface Props {
  onCapture: (blob: Blob, filename: string) => void
  disabled?: boolean
}

const BAR_COUNT = 24

export function VoiceCapture({ onCapture, disabled }: Props) {
  const { state, error, start, stop } = useWavRecorder()
  const [seconds, setSeconds] = useState(0)
  const reducedMotion = useReducedMotion()
  const timerRef = useRef<number | null>(null)

  const isRecording = state === 'recording'

  const handleStart = async () => {
    setSeconds(0)
    await start()
    timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
  }

  const handleStop = async () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    const blob = await stop()
    if (blob) onCapture(blob, 'voice.wav')
  }

  const handleFile = (file: File) => onCapture(file, file.name)

  return (
    <div className="rounded-lg border border-border bg-panel p-6">
      <div className="mb-4 flex items-center gap-2 text-text-muted">
        <Mic className="h-4 w-4" />
        <span className="font-mono text-xs tracking-wider uppercase">Voice</span>
        {isRecording && (
          <motion.span
            className="ml-auto flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-danger uppercase"
            animate={reducedMotion ? undefined : { opacity: [1, 0.4, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-danger" />
            Rec
          </motion.span>
        )}
      </div>

      <motion.div
        className="mb-4 flex aspect-video items-center justify-center gap-1 rounded-md border bg-void"
        animate={{ borderColor: isRecording ? 'rgba(248, 113, 113, 0.5)' : '#2c3948' }}
      >
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <motion.div
            key={i}
            className={`w-1 rounded-full ${isRecording ? 'bg-accent' : 'bg-border-bright'}`}
            animate={
              isRecording && !reducedMotion
                ? { height: [4, 4 + ((i * 7) % 28) + 6, 4] }
                : { height: 4 }
            }
            transition={{ duration: 0.5 + (i % 5) * 0.08, repeat: isRecording ? Infinity : 0 }}
          />
        ))}
      </motion.div>

      {error && <p className="mb-3 text-xs text-danger">{error}</p>}

      <div className="flex gap-2">
        {!isRecording ? (
          <motion.button
            onClick={handleStart}
            disabled={disabled || state === 'processing'}
            whileTap={disabled || state === 'processing' ? undefined : { scale: 0.96 }}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent py-2 font-mono text-xs tracking-wide text-void uppercase transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Mic className="h-3.5 w-3.5" />
            {state === 'processing' ? 'Processing...' : 'Record'}
          </motion.button>
        ) : (
          <motion.button
            onClick={handleStop}
            whileTap={{ scale: 0.96 }}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-danger py-2 font-mono text-xs tracking-wide text-void uppercase transition-opacity hover:opacity-90"
          >
            <Square className="h-3.5 w-3.5" />
            Stop ({seconds}s)
          </motion.button>
        )}
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 font-mono text-xs tracking-wide text-text-muted uppercase transition-colors hover:border-border-bright hover:text-text">
          <Upload className="h-3.5 w-3.5" />
          File
          <input
            type="file"
            accept="audio/wav,audio/x-wav,audio/wave"
            className="hidden"
            disabled={disabled || isRecording}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      </div>
    </div>
  )
}
