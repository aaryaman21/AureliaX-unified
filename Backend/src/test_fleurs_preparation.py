import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import soundfile as sf
from datasets import Audio, Dataset, load_dataset

from speech_data.audio import decode_audio, standardize, verify_wav, write_wav
from speech_data.augmentation import generate_degraded
from speech_data.config import quotas
from speech_data.integrity import check_integrity
from speech_data.metadata import Store
from speech_data.pipeline import process_split
from speech_data.loading import inspect_languages


class FakeStream:
    features = {}

    def __init__(self, records, position=0):
        self.records, self.position = records, position

    def __iter__(self):
        return self

    def __next__(self):
        if self.position == len(self.records):
            raise StopIteration
        row = self.records[self.position]
        self.position += 1
        return row

    def state_dict(self):
        return {'position': self.position}


def record(index=0):
    buffer = io.BytesIO()
    y = np.sin(np.arange(1600) * (index + 1) * .07) * .1
    sf.write(buffer, y, 16000, format='WAV', subtype='PCM_16')
    return {'id': index, 'audio': {'bytes': buffer.getvalue(), 'path': f'{index}.wav'}}


class PreparationTests(unittest.TestCase):
    def test_real_datasets_stream_checkpoint(self):
        # Local fixture only: verify the installed streaming library's state
        # contract without downloading or substituting a dataset source.
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / 'fixture.parquet'
            Dataset.from_list([record(i) for i in range(8)]).cast_column('audio', Audio(decode=False)).to_parquet(path)
            def stream():
                return load_dataset('parquet', data_files=str(path), split='train',
                                    streaming=True, batch_size=4, cache_dir=str(root / 'cache')).cast_column('audio', Audio(decode=False))
            first = stream()
            iterator = iter(first)
            self.assertEqual([next(iterator)['id'] for _ in range(3)], [0, 1, 2])
            state = first.state_dict()
            iterator.close()
            resumed = stream()
            resumed.load_state_dict(state)
            self.assertEqual([r['id'] for r in resumed], [3, 4, 5, 6, 7])

    def test_config_inspection_excludes_unavailable_languages(self):
        with tempfile.TemporaryDirectory() as temp:
            destination = Path(temp) / 'languages.json'
            with patch('speech_data.loading.HfApi') as api, \
                 patch('speech_data.loading.get_dataset_config_names', return_value=['en_us', 'ur_pk', 'all']), \
                 patch('speech_data.loading.load_dataset') as loader:
                api.return_value.dataset_info.return_value.sha = 'pinned'
                inspected = inspect_languages(destination)
                self.assertEqual(inspected['selected'], {'english': 'en_us', 'urdu': 'ur_pk'})
                self.assertIn('sindhi', inspected['unavailable'])
                loader.assert_not_called()
            with patch('speech_data.loading.HfApi') as api:
                self.assertEqual(inspect_languages(destination), inspected)
                api.assert_not_called()

    def test_conversion_preserves_loudness_and_duration(self):
        x = np.ones((4800, 2)) * .2
        pcm, _ = standardize(x, 48000)
        self.assertEqual(len(pcm), 1600)
        self.assertAlmostEqual(float(np.mean(pcm[100:-100])) / 32768, .2, places=3)

    def test_nonfinite_and_silence_rejected(self):
        for samples in [np.array([np.nan]), np.zeros(100), np.array([])]:
            with self.assertRaises(ValueError):
                standardize(samples, 16000)

    def test_resume_duplicate_rejection_and_training_only_augmentation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            store = Store(root / 'state.sqlite')
            try:
                first = FakeStream([record(0), record(1)])
                with patch('speech_data.pipeline.stream_language', return_value=first):
                    process_split(store, root, 'english', 'en_us', 'train', 1, 'revision')
                # Completed split doesn't even construct a network stream.
                with patch('speech_data.pipeline.stream_language') as loader:
                    process_split(store, root, 'english', 'en_us', 'train', 1, 'revision')
                    loader.assert_not_called()
                checkpoint = store.checkpoint('en_us/train')
                self.assertEqual(checkpoint['stream']['position'], 1)
                with patch('speech_data.pipeline.stream_language', return_value=FakeStream([record(0), record(1)], 1)) as loader:
                    process_split(store, root, 'english', 'en_us', 'train', 2, 'revision')
                    self.assertEqual(loader.call_args.args[-1], {'position': 1})
                # Same audio in validation is rejected; next unique sample is retained.
                with patch('speech_data.pipeline.stream_language', return_value=FakeStream([record(0), record(2)])):
                    process_split(store, root, 'english', 'en_us', 'validation', 1, 'revision')
                rows = store.rows()
                self.assertEqual(len(rows), 3)
                self.assertEqual(check_integrity(rows, root)['split_violations'], 0)
                speaker_rows = [dict(row, speaker_id='same-speaker') for row in rows]
                speaker_rows[-1]['language_code'] = 'as_in'
                with self.assertRaisesRegex(ValueError, 'Speaker crosses splits'):
                    check_integrity(speaker_rows, root, verify_audio=False)
                wrong_label = [dict(rows[0], label=1, class_name='ai_generated')]
                with self.assertRaisesRegex(ValueError, 'FLEURS must be human'):
                    check_integrity(wrong_label, root, verify_audio=False)
                for row in rows:
                    self.assertEqual(row['label'], 0)
                originals = {r['file_path']: (root / r['file_path']).read_bytes() for r in rows}
                augmented = generate_degraded(rows, root, fraction=1)
                self.assertEqual(len(augmented), 5)
                check_integrity(augmented, root)
                for row in augmented[3:]:
                    self.assertEqual(row['split'], 'train')
                    self.assertEqual(row['label'], 0)
                for path, content in originals.items():
                    self.assertEqual((root / path).read_bytes(), content)
            finally:
                store.close()

    def test_ai_uses_identical_augmentation_and_label_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            pcm, info = decode_audio(record()['audio'])
            write_wav(root / 'ai.wav', pcm)
            row = dict(file_path='ai.wav', label=1, class_name='ai_generated', language='english',
                       split='train', augmentation='none', **info)
            result = generate_degraded([row], root, fraction=1)
            self.assertEqual(result[-1]['label'], 1)
            self.assertEqual(result[-1]['class_name'], 'ai_generated')
            verify_wav(root / result[-1]['file_path'], result[-1]['pcm_sha256'])

    def test_quotas(self):
        self.assertEqual(quotas(1000), {'train': 700, 'validation': 150, 'test': 150})


if __name__ == '__main__':
    unittest.main()
