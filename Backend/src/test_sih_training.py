import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import soundfile as sf

from train_sih_local import audit, balanced_weights, benchmark_group_splits, decoded_hash, representative_window
from audio_preprocessing import preprocess_samples
from live_chunk_detector import aggregate_chunk_results
from speaker_diarization import diarize_audio, DiarizationSetupError


class LocalTrainingTests(unittest.TestCase):
    def test_class_balance_and_small_demo_source_cap(self):
        rows = ([dict(label=0,source='legacy',language='unknown')]*100 +
                [dict(label=1,source='legacy',language='unknown')]*100 +
                [dict(label=0,source='fleurs',language='hindi')]*1000 +
                [dict(label=0,source='fleurs',language='english')]*100 +
                [dict(label=1,source='mscadd',language='unknown')]*2)
        w = balanced_weights(rows)
        y = np.array([r['label'] for r in rows])
        self.assertAlmostEqual(w[y==0].sum(), w[y==1].sum())
        self.assertLess(w[-2:].sum()/w[y==1].sum(),.05)
        self.assertAlmostEqual(w[200:1200].sum(),w[1200:1300].sum())

    def test_benchmark_conversations_never_cross_splits(self):
        rows = [dict(source='benchmark',group=f'conversation-{label}-{i}',label=label)
                for label in (0,1) for i in range(20) for _ in range(3)]
        assigned = benchmark_group_splits(rows)
        for label in (0,1):
            self.assertEqual({assigned[r['group']] for r in rows if r['label']==label},
                             {'training','validation','testing'})
        self.assertEqual(assigned,benchmark_group_splits(rows))

    def test_same_pcm_across_lossless_containers_has_same_hash(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            y=np.sin(np.arange(16000)*.1)*.2
            sf.write(root/'a.wav',y,16000,subtype='PCM_16')
            sf.write(root/'a.flac',y,16000,subtype='PCM_16')
            self.assertEqual(decoded_hash(root/'a.wav')[0],decoded_hash(root/'a.flac')[0])

    def test_center_window_is_deterministic_and_label_independent(self):
        x=np.arange(160000,dtype=np.float32)
        np.testing.assert_array_equal(representative_window(x,16000),x[64000:96000])

    def test_quiet_or_short_audio_is_rejected_before_inference(self):
        self.assertFalse(preprocess_samples(np.sin(np.arange(16000)*.1)*1e-7,16000).valid)
        self.assertFalse(preprocess_samples(np.sin(np.arange(8000)*.1)*.2,16000).valid)
        with self.assertRaises(ValueError):
            preprocess_samples(np.array([np.nan]),16000)

    def test_two_isolated_flags_do_not_make_long_human_call_high_risk(self):
        chunks=[dict(start=2*i,end=2*i+2,fake_score=.9 if i<2 else .01,
                     risk_level='HIGH RISK' if i<2 else 'SAFE') for i in range(100)]
        result=aggregate_chunk_results(chunks,dict(real_if_fake_score_at_or_below=.4,fake_if_fake_score_at_or_above=.6))
        self.assertEqual(result['risk_level'],'SUSPICIOUS')
        self.assertLess(result['overall_risk_score'],.05)

    def test_missing_diarizer_does_not_invent_two_speakers(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'audio.wav'
            path.touch()
            with patch('speaker_diarization._hf_token',return_value=None):
                with self.assertRaises(DiarizationSetupError):
                    diarize_audio(path,samples=np.ones(16000,dtype=np.float32),sample_rate=16000)


if __name__=='__main__':
    unittest.main()
