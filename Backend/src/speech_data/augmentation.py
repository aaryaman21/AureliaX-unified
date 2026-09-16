"""Optional, label-independent training degradation. Never called by FLEURS preparation."""
import hashlib
from collections import defaultdict

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

from .audio import standardize, verify_wav, write_wav
from .config import SAMPLE_RATE

KINDS = ('noise', 'telephone', 'reverb', 'reduced_volume', 'mild_clipping')


def degrade(samples, kind, seed):
    rng = np.random.default_rng(seed)
    y = np.asarray(samples, dtype=np.float64).copy()
    if kind == 'noise':
        # 20--30 dB SNR, relative to the recording's own signal energy.
        rms = np.sqrt(np.mean(y ** 2))
        y += rng.normal(0, rms / 10 ** (rng.uniform(20, 30) / 20), len(y))
    elif kind == 'telephone':
        y = sosfilt(butter(4, [300, 3400], btype='bandpass', fs=SAMPLE_RATE, output='sos'), y)
    elif kind == 'reverb':
        original = y.copy()
        for seconds, gain in [(0.025, .12), (.05, .06), (.085, .03)]:
            delay = int(seconds * SAMPLE_RATE)
            if len(y) > delay:
                y[delay:] += gain * original[:-delay]
        y /= 1.21
    elif kind == 'reduced_volume':
        y *= rng.uniform(.4, .7)
    elif kind == 'mild_clipping':
        limit = max(1 / 32768, float(np.max(np.abs(y))) * .9)
        y = np.clip(y, -limit, limit)
    else:
        raise ValueError(f'Unsupported degradation: {kind}')
    return standardize(y, SAMPLE_RATE)[0]


def generate_degraded(rows, root, fraction=.2, seed=42):
    """Return augmented metadata alongside parents; caller persists a separate manifest.

    Deterministic selection applies the same fraction within each class/language.
    Only original training rows are eligible; originals are never overwritten.
    """
    if not 0 <= fraction <= 1:
        raise ValueError('fraction must be between zero and one')
    result = list(rows)
    eligible = defaultdict(list)
    for parent in rows:
        if parent['split'] != 'train' or parent['augmentation'] != 'none':
            continue
        digest = hashlib.sha256(f'{seed}:{parent["pcm_sha256"]}'.encode()).hexdigest()
        eligible[(int(parent['label']), parent['language'])].append((digest, parent))
    selected = []
    for group in eligible.values():
        selected.extend(sorted(group, key=lambda item: item[0])[:int(len(group) * fraction)])
    for digest, parent in selected:
        kind = KINDS[int(digest[8:16], 16) % len(KINDS)]
        original = (root / parent['file_path']).resolve()
        if not original.is_relative_to(root.resolve()):
            raise ValueError('Parent path escapes dataset root')
        samples, rate = sf.read(original)
        if rate != SAMPLE_RATE:
            raise ValueError('Standardize audio before augmentation')
        pcm = degrade(samples, kind, int(digest[16:24], 16))
        relative = f'augmented/{parent["class_name"]}/{parent["language"]}/{digest}.wav'
        output = (root / relative).resolve()
        if not output.is_relative_to(root.resolve()) or output == original:
            raise ValueError('Invalid degradation output path')
        if not output.exists():
            write_wav(output, pcm)
        verify_wav(output, hashlib.sha256(pcm.tobytes()).hexdigest())
        row = dict(parent, file_path=relative, quality_type='degraded', augmentation=kind,
                   parent_file=parent['file_path'], pcm_sha256=hashlib.sha256(pcm.tobytes()).hexdigest())
        result.append(row)
    return result
