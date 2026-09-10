"""Voice preprocessing: load -> resample -> mono -> VAD -> loudness norm -> segment -> log-mel.

Entirely classical DSP (`numpy` + `scipy` only, deliberately - see
docs/VOICE_MODEL.md's "Zero hard dependencies for preprocessing" note) - the
deep-learning step happens later, in models/voice/inference.py, on the
log-mel filterbank produced here.

Mirrors preprocessing/iris.py's shape: `preprocess()` returns a bare 2D array
(`(n_mels, n_frames)`) and lets `embeddings/pipelines.py::ModalityPipeline.embed()`'s
existing "2D -> 3-channel stack" fallback satisfy `BaseEmbedder`'s
`(H, W, 3)` shape contract - voice's "image" is a mel-spectrogram, not a
photograph. See docs/VOICE_MODEL.md's "Integration" section for the full
rationale.

Pipeline (mirrors the spec's audio-preprocessing steps 1-6):
    1. Load WAV (`load_wav_file`).
    2. Resample to `sample_rate` (default 16 kHz).
    3. Mono conversion (average channels).
    4. Voice activity detection: trim near-silent frames.
    5. Loudness normalization: scale to a target RMS level.
    6. Fixed-length segment extraction: random crop when `training=True`,
       center crop otherwise; zero-pad if the clip is shorter than the
       target length.
Then: 80-bin log-mel filterbank extraction.
"""

from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly, stft

#: Defaults match docs/VOICE_MODEL.md's hyperparameter table.
TARGET_SAMPLE_RATE = 16_000
CLIP_SECONDS = 4.0
N_MELS = 80
N_FFT = 400  # 25ms at 16kHz
HOP_LENGTH = 160  # 10ms at 16kHz


def _normalize_pcm_waveform(sample_rate: int, waveform: np.ndarray) -> tuple[np.ndarray, int]:
    """Shared by `load_wav_file`/`load_wav_bytes`: int PCM -> float32 in [-1, 1]."""
    if np.issubdtype(waveform.dtype, np.integer):
        max_value = float(np.iinfo(waveform.dtype).max)
        waveform = waveform.astype(np.float32) / max_value
    else:
        waveform = waveform.astype(np.float32)
    return waveform, sample_rate


def load_wav_file(path: str | Path) -> tuple[np.ndarray, int]:
    """Read a WAV file into a float32 waveform in [-1, 1] plus its sample rate.

    WAV-only, per the spec ("Step 1 - Audio Loading: WAV only"); converting
    other formats is explicitly out of scope for this zero-extra-dependency
    path (a real deployment could add an `audioread`/`torchaudio`-based
    fallback for other formats without changing this function's contract).
    """
    sample_rate, waveform = wavfile.read(path)
    return _normalize_pcm_waveform(sample_rate, waveform)


def load_wav_bytes(contents: bytes) -> tuple[np.ndarray, int]:
    """Same as `load_wav_file`, for WAV bytes already read into memory
    (e.g. `backend/api/*.py`'s uploaded-file handling, which reads an
    `UploadFile` into bytes once rather than seeking a stream twice)."""
    sample_rate, waveform = wavfile.read(io.BytesIO(contents))
    return _normalize_pcm_waveform(sample_rate, waveform)


def _hz_to_mel(hz: np.ndarray | float) -> np.ndarray | float:
    return 2595.0 * np.log10(1.0 + hz / 700.0)


def _mel_to_hz(mel: np.ndarray | float) -> np.ndarray | float:
    return 700.0 * (10.0 ** (mel / 2595.0) - 1.0)


def _build_mel_filterbank(sample_rate: int, n_fft: int, n_mels: int) -> np.ndarray:
    """Standard triangular mel filterbank, shape (n_mels, n_fft // 2 + 1).

    Built once per `VoicePreprocessor` instance (not per call) since it only
    depends on the (fixed) sample rate / FFT size / mel-bin count.
    """
    n_freq_bins = n_fft // 2 + 1
    mel_min, mel_max = _hz_to_mel(0.0), _hz_to_mel(sample_rate / 2.0)
    mel_points = np.linspace(mel_min, mel_max, n_mels + 2)
    hz_points = _mel_to_hz(mel_points)
    bin_points = np.floor((n_fft + 1) * hz_points / sample_rate).astype(int)
    bin_points = np.clip(bin_points, 0, n_freq_bins - 1)

    filterbank = np.zeros((n_mels, n_freq_bins), dtype=np.float64)
    for m in range(1, n_mels + 1):
        left, center, right = bin_points[m - 1], bin_points[m], bin_points[m + 1]
        if center == left:
            center = min(center + 1, n_freq_bins - 1)
        if right == center:
            right = min(right + 1, n_freq_bins - 1)
        for k in range(left, center):
            filterbank[m - 1, k] = (k - left) / (center - left)
        for k in range(center, right):
            if k < n_freq_bins:
                filterbank[m - 1, k] = (right - k) / (right - center)
    return filterbank.astype(np.float32)


class VoicePreprocessor:
    """Turns a raw waveform into a fixed-shape log-mel filterbank for the voice embedder."""

    def __init__(
        self,
        sample_rate: int = TARGET_SAMPLE_RATE,
        clip_seconds: float = CLIP_SECONDS,
        n_mels: int = N_MELS,
        n_fft: int = N_FFT,
        hop_length: int = HOP_LENGTH,
        vad_energy_threshold_ratio: float = 0.02,
        target_rms: float = 0.1,
    ):
        self.sample_rate = sample_rate
        self.clip_seconds = clip_seconds
        self.n_mels = n_mels
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.vad_energy_threshold_ratio = vad_energy_threshold_ratio
        self.target_rms = target_rms
        self.target_num_samples = int(round(sample_rate * clip_seconds))
        self._mel_filterbank = _build_mel_filterbank(sample_rate, n_fft, n_mels)

    def _resample(self, waveform: np.ndarray, original_sample_rate: int) -> np.ndarray:
        if original_sample_rate == self.sample_rate:
            return waveform
        # resample_poly needs integer up/down factors; reduce via GCD so the
        # intermediate signal isn't unnecessarily long for e.g. 44100 -> 16000.
        from math import gcd

        divisor = gcd(self.sample_rate, original_sample_rate)
        up, down = self.sample_rate // divisor, original_sample_rate // divisor
        return resample_poly(waveform, up, down).astype(np.float32)

    @staticmethod
    def _to_mono(waveform: np.ndarray) -> np.ndarray:
        if waveform.ndim == 1:
            return waveform
        return waveform.mean(axis=-1).astype(np.float32)

    def _trim_silence(self, waveform: np.ndarray, frame_length: int = 400, hop_length: int = 160) -> np.ndarray:
        """Energy-based voice activity detection: drop frames below a fraction of peak energy.

        Deliberately dependency-free (no `webrtcvad`, which needs a compiled
        C extension that isn't reliably installable on every dev machine -
        see docs/VOICE_MODEL.md). Falls back to returning the original
        waveform unchanged if every frame would otherwise be dropped (e.g. a
        fully-silent clip), rather than returning an empty array.
        """
        if len(waveform) < frame_length:
            return waveform

        num_frames = 1 + (len(waveform) - frame_length) // hop_length
        frame_energies = np.array(
            [
                np.sqrt(np.mean(waveform[i * hop_length : i * hop_length + frame_length] ** 2))
                for i in range(num_frames)
            ]
        )
        peak_energy = frame_energies.max()
        if peak_energy == 0:
            return waveform

        voiced = frame_energies >= (peak_energy * self.vad_energy_threshold_ratio)
        if not voiced.any():
            return waveform

        kept_samples = np.concatenate(
            [waveform[i * hop_length : i * hop_length + frame_length] for i in range(num_frames) if voiced[i]]
        )
        return kept_samples if len(kept_samples) > 0 else waveform

    def _normalize_loudness(self, waveform: np.ndarray) -> np.ndarray:
        rms = np.sqrt(np.mean(waveform**2))
        if rms == 0:
            return waveform
        scaled = waveform * (self.target_rms / rms)
        return np.clip(scaled, -1.0, 1.0).astype(np.float32)

    def _fixed_length_segment(self, waveform: np.ndarray, training: bool, rng: np.random.Generator | None) -> np.ndarray:
        num_samples = len(waveform)
        if num_samples == self.target_num_samples:
            return waveform
        if num_samples < self.target_num_samples:
            pad_width = self.target_num_samples - num_samples
            return np.pad(waveform, (0, pad_width))

        if training:
            rng = rng or np.random.default_rng()
            start = int(rng.integers(0, num_samples - self.target_num_samples + 1))
        else:
            start = (num_samples - self.target_num_samples) // 2
        return waveform[start : start + self.target_num_samples]

    def _log_mel_filterbank(self, waveform: np.ndarray) -> np.ndarray:
        """80-bin log-mel filterbank, shape (n_mels, n_frames)."""
        _, _, spectrum = stft(
            waveform,
            fs=self.sample_rate,
            nperseg=self.n_fft,
            noverlap=self.n_fft - self.hop_length,
            boundary=None,
            padded=False,
        )
        magnitude = np.abs(spectrum)  # (n_freq_bins, n_frames)
        mel_energies = self._mel_filterbank @ magnitude  # (n_mels, n_frames)
        log_mel = np.log(np.maximum(mel_energies, 1e-10))
        # Mean normalization (per the spec's "Mean normalization" feature-extraction step).
        return (log_mel - log_mel.mean(axis=1, keepdims=True)).astype(np.float32)

    def preprocess(
        self,
        raw_audio: np.ndarray,
        sample_rate: int,
        training: bool = False,
        rng: np.random.Generator | None = None,
    ) -> np.ndarray:
        """Run the full pipeline on an already-loaded waveform.

        `training=True` selects a random crop for the fixed-length segment
        step (data variety during training); `training=False` (inference)
        uses a deterministic center crop, per the spec.
        """
        waveform = self._to_mono(raw_audio)
        waveform = self._resample(waveform, sample_rate)
        waveform = self._trim_silence(waveform)
        waveform = self._normalize_loudness(waveform)
        waveform = self._fixed_length_segment(waveform, training=training, rng=rng)
        return self._log_mel_filterbank(waveform)
