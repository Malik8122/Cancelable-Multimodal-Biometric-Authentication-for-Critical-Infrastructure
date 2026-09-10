import { encodeWav } from './wav'

// These build the same kind of synthetic, non-biometric samples the
// backend's own offline test suite uses (see tests/conftest.py's
// synthetic_fingerprint_image and tests/test_fusion_endpoint.py's tone()) -
// good enough for a real enroll/verify roundtrip against the real
// checkpoints, without needing a real fingerprint scanner or microphone.
// The Testing Mode page uses these to run real API calls, not to fabricate
// results - every score/decision shown still comes back from the live
// backend.

export function syntheticFingerprintPng(): Promise<Blob> {
  const size = 300
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = Math.round(Math.sin((x / size) * 20 * Math.PI) * 127 + 128)
      const offset = (y * size + x) * 4
      image.data[offset] = value
      image.data[offset + 1] = value
      image.data[offset + 2] = value
      image.data[offset + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/png'))
}

export function syntheticToneWav(durationSeconds = 2, frequency = 220, sampleRate = 16_000): Blob {
  const length = Math.floor(sampleRate * durationSeconds)
  const samples = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    samples[i] = 0.3 * Math.sin((2 * Math.PI * frequency * i) / sampleRate)
  }
  return encodeWav(samples, sampleRate)
}
