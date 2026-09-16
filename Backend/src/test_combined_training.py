import csv
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import joblib
import numpy as np

import train_combined
import prepare_combined_manifest


class CombinedTrainingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_cwd = Path.cwd()
        os.chdir(self.temp.name)
        self.rows = []
        for split, groups in [('training', 6), ('validation', 2), ('testing', 2)]:
            for group in range(groups):
                for label in ['REAL', 'FAKE']:
                    path = Path(f'{split}_{group}_{label}.wav')
                    path.write_bytes(str(path).encode())
                    self.rows.append(dict(path=str(path), label=label, group=f'{split}_{group}',
                                          split=split, source='mscadd' if group % 2 else 'local'))
        self.write_manifest()

    def tearDown(self):
        os.chdir(self.old_cwd)
        self.temp.cleanup()

    def write_manifest(self):
        with open('manifest.csv', 'w', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=['path', 'label', 'group', 'split', 'source'])
            writer.writeheader()
            writer.writerows(self.rows)

    def test_group_leakage_rejected(self):
        self.rows[-1]['group'] = self.rows[0]['group']
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, 'crosses splits'):
            train_combined.read_manifest('manifest.csv')

    def test_duplicate_audio_rejected(self):
        Path(self.rows[-1]['path']).write_bytes(Path(self.rows[0]['path']).read_bytes())
        with self.assertRaisesRegex(ValueError, 'Duplicate audio bytes'):
            train_combined.read_manifest('manifest.csv')

    def test_private_test_audio_rejected(self):
        self.rows[0]['path'] = 'test_audio/human_test.wav'
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, 'protected test_audio'):
            train_combined.read_manifest('manifest.csv')

    def test_split_keeps_groups_together(self):
        for row in self.rows:
            row['split'] = ''
        self.write_manifest()
        with patch('sys.argv', ['prepare_combined_manifest', 'manifest.csv']):
            prepare_combined_manifest.main()
        result = train_combined.read_manifest('combined_manifest.csv')
        groups = {}
        for row in result:
            groups.setdefault(row['group'], set()).add(row['split'])
        self.assertTrue(all(len(splits) == 1 for splits in groups.values()))
        self.assertEqual(sum(splits == {'training'} for splits in groups.values()), 7)

    def test_pipeline_freezes_before_testing(self):
        output = Path('models/voiceshield_combined')
        def embedding(extractor, path, cache):
            if path.startswith('testing'):
                self.assertTrue((output / 'classifier.joblib').exists())
                self.assertTrue((output / 'metadata.json').exists())
            sign = 1 if 'FAKE' in path else -1
            return np.array([sign, sign * 2, .1], dtype=np.float32), {}, False
        with patch('sys.argv', ['train_combined', 'manifest.csv']), \
             patch.object(train_combined, 'WavLMFeatureExtractor') as extractor, \
             patch.object(train_combined, 'cached_embedding', side_effect=embedding):
            extractor.return_value.config_dict.return_value = {}
            train_combined.main()
        model = joblib.load(output / 'classifier.joblib')
        self.assertEqual(list(model.named_steps['classifier'].classes_), [0, 1])
        self.assertGreater(model.predict_proba([[1, 2, .1]])[0, 1], .5)
        report = json.loads((output / 'test_report.json').read_text())
        self.assertEqual(report['overall']['confusion_matrix'], [[2, 0], [0, 2]])


if __name__ == '__main__':
    unittest.main()
