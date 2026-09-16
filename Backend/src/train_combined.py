"""Train from an explicitly labeled, grouped manifest; never scan test_audio.

CSV columns: path,label,group,split,source
label is REAL or FAKE; split is training, validation, or testing.
Paths are relative to the project root. Group must join all recordings sharing
a speaker or original conversation (including synthetic derivatives).
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, f1_score, log_loss, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from wavlm_features import WavLMFeatureExtractor, cached_embedding


def read_manifest(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise ValueError('Empty manifest')
    groups, hashes, paths = {}, {}, set()
    root = Path.cwd().resolve()
    for row in rows:
        if not all(row.get(k, '').strip() for k in ['path', 'label', 'group', 'split', 'source']):
            raise ValueError('Each row needs path,label,group,split,source')
        if row['label'] not in ['REAL', 'FAKE'] or row['split'] not in ['training', 'validation', 'testing']:
            raise ValueError(f'Invalid label or split: {row}')
        audio_path = Path(row['path']).resolve()
        if not audio_path.is_relative_to(root) or 'test_audio' in [part.lower() for part in audio_path.parts]:
            raise ValueError(f'External path or protected test_audio path: {audio_path}')
        if audio_path in paths:
            raise ValueError(f'Duplicate path: {audio_path}')
        paths.add(audio_path)
        group = row['group']
        if group in groups and groups[group] != row['split']:
            raise ValueError(f'Group crosses splits: {group}')
        groups[group] = row['split']
        digest = hashlib.sha256(audio_path.read_bytes()).hexdigest()
        if digest in hashes:
            raise ValueError(f'Duplicate audio bytes: {audio_path} and {hashes[digest]}')
        hashes[digest] = row['path']
        row['sha256'] = digest
    for split in ['training', 'validation', 'testing']:
        if {r['label'] for r in rows if r['split'] == split} != {'REAL', 'FAKE'}:
            raise ValueError(f'{split} must contain both classes')
    if not any(r['source'].lower() == 'mscadd' for r in rows):
        raise ValueError('Manifest must include MsCADD data')
    if not any(r['source'].lower() != 'mscadd' for r in rows):
        raise ValueError('Manifest must also include the local labeled dataset')
    return rows


def metrics(y, scores, real_threshold=.45, fake_threshold=.55):
    prediction = (scores >= .5).astype(int)
    matrix = confusion_matrix(y, prediction, labels=[0, 1])
    return {'confusion_matrix': matrix.tolist(),
            'macro_f1': float(f1_score(y, prediction, average='macro')),
            'roc_auc': float(roc_auc_score(y, scores)),
            'log_loss': float(log_loss(y, scores)),
            'human_called_fake_rate': float(np.mean(scores[y == 0] >= fake_threshold)),
            'fake_called_real_rate': float(np.mean(scores[y == 1] <= real_threshold)),
            'suspicious_rate': float(np.mean((scores > real_threshold) & (scores < fake_threshold)))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest')
    parser.add_argument('--output', default='models/voiceshield_combined')
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    rows = read_manifest(args.manifest)
    counts = {s: sum(r['split'] == s for r in rows) for s in ['training', 'validation', 'testing']}
    print('Manifest counts:', counts, flush=True)
    if args.validate_only:
        return
    output = Path(args.output)
    if output.exists():
        raise ValueError('Use a new output directory to preserve existing model artifacts')
    extractor = WavLMFeatureExtractor()
    arrays = {}
    for split in ['training', 'validation']:
        subset = [r for r in rows if r['split'] == split]
        x = []
        for index, row in enumerate(subset, 1):
            embedding, _, hit = cached_embedding(extractor, row['path'], 'cache/combined')
            if not np.isfinite(embedding).all():
                raise ValueError(f'Non-finite embedding: {row["path"]}')
            x.append(embedding)
            print(f'{split} {index}/{len(subset)} {"cached" if hit else "extracted"}', flush=True)
        arrays[split] = (np.vstack(x), np.array([int(r['label'] == 'FAKE') for r in subset]),
                         np.array([r['group'] for r in subset]))
    x, y, groups = arrays['training']
    xv, yv, _ = arrays['validation']
    folds = list(StratifiedGroupKFold(n_splits=3, shuffle=True, random_state=42).split(x, y, groups))
    for train, calibration in folds:
        if len(set(y[train])) != 2 or len(set(y[calibration])) != 2:
            raise ValueError('Not enough independent groups of both classes for calibration')
    candidates, best, best_key = {}, None, None
    for c in [.001, .01, .1]:
        base = Pipeline([('scaler', StandardScaler()), ('classifier', LogisticRegression(
            C=c, class_weight='balanced', max_iter=3000, random_state=42))])
        calibrated = CalibratedClassifierCV(base, method='sigmoid', cv=folds)
        calibrated.fit(x, y)
        scores = calibrated.predict_proba(xv)[:, list(calibrated.classes_).index(1)]
        result = metrics(yv, scores)
        candidates[str(c)] = result
        key = (result['macro_f1'], -result['log_loss'])
        if best_key is None or key > best_key:
            best, best_key, best_c, val_scores = calibrated, key, c, scores
        print('C=', c, result, flush=True)
    # Thresholds use validation only; abstention is reported separately from binary accuracy.
    real_threshold = min(.45, float(np.quantile(val_scores[yv == 1], .05)))
    fake_threshold = max(.55, float(np.quantile(val_scores[yv == 0], .95)))
    thresholds = {'real_if_fake_score_at_or_below': real_threshold,
                  'fake_if_fake_score_at_or_above': fake_threshold,
                  'suspicious_between_thresholds': True}
    # Preserve the inference interface while the calibrated estimator contains its own scaler.
    model = Pipeline([('classifier', best)])
    output.mkdir(parents=True)
    joblib.dump(model, output / 'classifier.joblib')
    metadata = {'project': 'VoiceShield', 'label_mapping': {'REAL': 0, 'FAKE': 1},
                'selected_classifier': f'group_calibrated_logistic_C={best_c}',
                'feature_config': extractor.config_dict(), 'decision_thresholds': thresholds,
                'candidate_validation_metrics': candidates, 'split_counts': counts,
                'manifest_sha256': hashlib.sha256(Path(args.manifest).read_bytes()).hexdigest(),
                'classifier_sha256': hashlib.sha256((output / 'classifier.joblib').read_bytes()).hexdigest(),
                'warning': 'Group separation depends on supplied provenance; scores are not guarantees on unseen domains.'}
    (output / 'metadata.json').write_text(json.dumps(metadata, indent=2))
    (output / 'manifest.json').write_text(json.dumps(rows, indent=2))
    # Freeze the model before opening held-out audio for feature extraction.
    heldout = [r for r in rows if r['split'] == 'testing']
    test_scores = []
    for index, row in enumerate(heldout, 1):
        embedding, _, _ = cached_embedding(extractor, row['path'], 'cache/combined')
        test_scores.append(float(model.predict_proba(embedding.reshape(1, -1))[0, 1]))
        print(f'testing {index}/{len(heldout)}', flush=True)
    yt = np.array([int(r['label'] == 'FAKE') for r in heldout])
    scores = np.array(test_scores)
    report = {'overall': metrics(yt, scores, real_threshold, fake_threshold), 'by_source': {}}
    for source in sorted({r['source'] for r in heldout}):
        mask = np.array([r['source'] == source for r in heldout])
        if len(set(yt[mask])) == 2:
            report['by_source'][source] = metrics(yt[mask], scores[mask], real_threshold, fake_threshold)
    (output / 'test_report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2), flush=True)
    print('Saved:', output, flush=True)


if __name__ == '__main__':
    main()
