"""Identical, minimally invasive conversion for human and future AI sources."""
import hashlib
import io
import math
import os
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from .config import SAMPLE_RATE


def standardize(samples, rate):
    samples = np.asarray(samples, dtype=np.float64)
    if samples.ndim not in (1, 2) or not samples.size or rate <= 0:
        raise ValueError('Empty audio, invalid sample rate, or unsupported channel shape')
    if not np.isfinite(samples).all():
        raise ValueError('Non-finite audio samples')
    if samples.ndim == 2:
        samples = samples.mean(axis=1)
    if rate != SAMPLE_RATE:
        divisor = math.gcd(int(rate), SAMPLE_RATE)
        samples = resample_poly(samples, SAMPLE_RATE // divisor, int(rate) // divisor)
    if not np.any(samples):
        raise ValueError('Digital silence')
    # No normalization, trimming, denoising, padding, or duration truncation.
    clipped = int(np.count_nonzero((samples < -1) | (samples >= 1)))
    pcm = np.clip(np.rint(samples * 32768), -32768, 32767).astype('<i2')
    if not np.any(pcm):
        raise ValueError('Audio becomes digital silence at PCM16 precision')
    return pcm, clipped


def decode_audio(audio):
    if audio.get('bytes') is not None:
        source = audio['bytes']
    elif audio.get('path'):
        source = Path(audio['path']).read_bytes()
    else:
        raise ValueError('No audio bytes or readable path')
    samples, rate = sf.read(io.BytesIO(source), dtype='float64', always_2d=True)
    pcm, clipped = standardize(samples, rate)
    return pcm, {'original_sample_rate': rate,
                 'original_channels': samples.shape[1],
                 'source_sha256': hashlib.sha256(source).hexdigest(),
                 'pcm_sha256': hashlib.sha256(pcm.tobytes()).hexdigest(),
                 'clipped_samples': clipped}


def write_wav(path, pcm):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.partial.wav')
    sf.write(temporary, pcm, SAMPLE_RATE, subtype='PCM_16', format='WAV')
    os.replace(temporary, path)


def verify_wav(path, expected_hash):
    info = sf.info(path)
    if (info.samplerate, info.channels, info.subtype, info.format) != (16000, 1, 'PCM_16', 'WAV'):
        raise ValueError(f'Unexpected audio format: {path}')
    pcm, _ = sf.read(path, dtype='int16')
    if hashlib.sha256(pcm.astype('<i2').tobytes()).hexdigest() != expected_hash:
        raise ValueError(f'Audio checksum mismatch: {path}')
    return info
