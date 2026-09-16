"""Select a separate classifier using training/validation caches only.

Run from the VoiceShield-AI directory. Never reads test_audio or testing data.
"""
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, log_loss
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


def load_split(split, config):
    rows, labels, sources, seen = [], [], set(), set()
    for path in sorted((Path('cache/wavlm') / split).glob('*.json')):
        meta = json.loads(path.read_text())
        source = Path(meta['source_path'])
        if source.parent not in [Path('dataset') / split / 'real', Path('dataset') / split / 'fake']:
            continue
        if meta['feature_config'] != config:
            continue
        variant = meta['variant']
        if variant != 'base' and (split != 'training' or not variant.startswith('aug1-seed')):
            continue
        identity = (str(source), variant)
        if identity in seen:
            raise ValueError(f'Duplicate cache entry: {identity}')
        seen.add(identity)
        sources.add(source)
        rows.append(np.load(path.with_suffix('.npy')))
        labels.append(int(source.parent.name == 'fake'))
    expected = set((Path('dataset') / split).glob('*/*.wav'))
    if not rows or sources != expected or set(labels) != {0, 1}:
        raise ValueError(f'Incomplete or incompatible {split} cache')
    hashes = {hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    return np.vstack(rows), np.array(labels), hashes


def metrics(model, x, y):
    probabilities = model.predict_proba(x)
    matrix = confusion_matrix(y, model.predict(x), labels=[0, 1])
    return {'confusion_matrix': matrix.tolist(),
            'real_false_positive_rate': float(matrix[0, 1] / matrix[0].sum()),
            'fake_false_negative_rate': float(matrix[1, 0] / matrix[1].sum()),
            'log_loss': float(log_loss(y, probabilities))}


def main():
    original = Path('models/voiceshield_wavlm')
    metadata = json.loads((original / 'metadata.json').read_text())
    x, y, train_hashes = load_split('training', metadata['feature_config'])
    xv, yv, val_hashes = load_split('validation', metadata['feature_config'])
    if train_hashes & val_hashes:
        raise ValueError('Training/validation duplicate audio detected')
    baseline = joblib.load(original / 'classifier.joblib')
    baseline_metrics = metrics(baseline, xv, yv)
    report = {'selection': 'Minimize human false positives without increasing fake false negatives; break ties by log loss.',
              'training_rows': len(y), 'validation_rows': len(yv),
              'baseline': baseline_metrics, 'candidates': {}}
    best, best_metrics, best_c = baseline, baseline_metrics, None
    for c in [0.0001, 0.001, 0.01, 0.1, 1.0]:
        model = make_pipeline(StandardScaler(), LogisticRegression(
            C=c, max_iter=3000, class_weight='balanced', random_state=42))
        # Keep the inference pipeline's public step name.
        model.steps[-1] = ('classifier', model.steps[-1][1])
        model.fit(x, y)
        result = metrics(model, xv, yv)
        report['candidates'][str(c)] = result
        print(c, result, flush=True)
        if (result['fake_false_negative_rate'] <= baseline_metrics['fake_false_negative_rate']
                and (result['real_false_positive_rate'], result['log_loss'])
                < (best_metrics['real_false_positive_rate'], best_metrics['log_loss'])):
            best, best_metrics, best_c = model, result, c
    output = Path('models/voiceshield_regularized_candidate')
    output.mkdir(exist_ok=True)
    report['selected_C'] = best_c
    report['selected_metrics'] = best_metrics
    joblib.dump(best, output / 'classifier.joblib')
    report['classifier_sha256'] = hashlib.sha256((output / 'classifier.joblib').read_bytes()).hexdigest()
    metadata['selected_classifier'] = 'original' if best_c is None else f'logistic_regression_C={best_c}'
    metadata['candidate_validation_metrics'] = report
    metadata['training']['custom_data_included'] = False
    (output / 'metadata.json').write_text(json.dumps(metadata, indent=2))
    (output / 'selection_report.json').write_text(json.dumps(report, indent=2))
    print('Saved candidate:', output, 'Selected C:', best_c, flush=True)


if __name__ == '__main__':
    main()
