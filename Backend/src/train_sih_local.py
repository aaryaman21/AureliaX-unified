"""Reproducible local-only training using labeled audio under an SIH workspace.

Stages: audit -> extract -> train. Originals and existing models are never overwritten.
Test recordings are excluded from training. Duplicates share one manifest row;
known source-conversation groups stay together, with test > validation > train.
Speaker-disjointness cannot be claimed when the source lacks speaker identifiers.
"""
import argparse
import collections
import copy
import csv
import hashlib
import json
import os
from pathlib import Path
import re
import time
import warnings

import joblib
import numpy as np
import soundfile as sf

BACKEND = Path(__file__).resolve().parents[1]
SPLITS = {'train': 'training', 'training': 'training', 'validation': 'validation',
          'test': 'testing', 'testing': 'testing'}
PRIORITY = {'training': 0, 'validation': 1, 'testing': 2}
EXCLUDED = {'.venv', 'venv', 'node_modules', '.git', '__pycache__', 'dist', 'cache'}
AUDIO_EXTENSIONS = {'.wav', '.flac', '.ogg', '.mp3', '.m4a', '.aac', '.mp4', '.webm'}
POLICY = 'sih-local-v1-center-2s-last4-stats'


def write_json(path, payload):
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding='utf-8')


def digest_bytes(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decoded_hash(path):
    samples, rate = sf.read(path, dtype='float32', always_2d=True)
    if not len(samples) or not np.isfinite(samples).all():
        raise ValueError('Empty or non-finite samples')
    key = f'{rate}:{samples.shape[1]}:'.encode() + samples.astype('<f4').tobytes()
    return hashlib.sha256(key).hexdigest(), len(samples) / rate


def identify(path, regional):
    if str(path) in regional:
        r = regional[str(path)]
        return dict(label=0, source='fleurs', language=r['language'],
                    split=SPLITS[r['split']], group='fleurs:' + r['pcm_sha256'],
                    speaker_id=r.get('speaker_id', ''), provenance='FLEURS manifest: human')
    parts = path.parts
    if path.parent.name not in {'real', 'fake'}:
        return None
    label = int(path.parent.name == 'fake')
    split = SPLITS.get(path.parent.parent.name)
    name = path.stem
    if 'downloaded_benchmark' in parts:
        match = re.match(r'[a-z]+_\d+', name)
        if not match:
            raise ValueError(f'Unknown benchmark conversation naming: {name}')
        source, group = 'benchmark', 'benchmark:' + match.group()
    elif 'telephony_calls' in parts:
        source, group = 'telephony', 'telephony:' + name
    elif 'MsCADD' in parts or not re.fullmatch(r'(real|fake)_\d+', name):
        if not any(s in name for s in ['NotebookLM', 'TTS_', 'Real Audio_']):
            return None
        source = 'mscadd'
        group = 'mscadd:' + re.sub(r'_chunk_\d+$', '', name)
        # Demo copies have no official split; dataset copies supply it later.
        split = split or 'training'
    elif 'dataset' in parts and split:
        source, group = 'legacy', 'legacy:' + name
    else:
        return None
    return dict(label=label, source=source, language='unknown', split=split,
                group=group, speaker_id='', provenance='Explicit real/fake directory label')


def benchmark_group_splits(rows):
    """Rebuild only the local benchmark's leaking random-file splits by source group.

    Official FLEURS and legacy/telephony splits are not reassigned to training.
    Old benchmark test files were already used in the old deployed scaler; this
    creates candidate-specific holdouts, not an unseen external benchmark.
    """
    from sklearn.model_selection import train_test_split
    groups = {}
    for row in rows:
        if row['source']=='benchmark':
            if row['group'] in groups and groups[row['group']] != row['label']:
                raise ValueError('Unexpected mixed benchmark group')
            groups[row['group']] = row['label']
    names = sorted(groups)
    train_groups, rest = train_test_split(names,train_size=.7,random_state=42,
                                         stratify=[groups[g] for g in names])
    val_groups, test_groups = train_test_split(rest,test_size=.5,random_state=42,
                                             stratify=[groups[g] for g in rest])
    return {g:split for split,subset in [('training',train_groups),('validation',val_groups),('testing',test_groups)] for g in subset}


def audit(workspace, output):
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / 'manifest.json'
    if (output / 'features').exists() or (output / 'classifier.joblib').exists():
        raise ValueError('Extraction/training already started; use a fresh output directory for a new audit')
    regional, paths, archive_info = {}, [], []
    scanned_files = 0
    for directory, dirs, files in os.walk(workspace):
        dirs[:] = sorted(d for d in dirs if d not in EXCLUDED and not d.startswith('sih_local_'))
        for name in sorted(files):
            path = Path(directory) / name
            scanned_files += 1
            if name == 'metadata.csv' and path.parent.name == 'dataset':
                with path.open(encoding='utf-8-sig', newline='') as handle:
                    for row in csv.DictReader(handle):
                        if row.get('source_dataset') == 'FLEURS':
                            if row['label'] != '0':
                                raise ValueError('FLEURS cannot be labeled synthetic')
                            regional[str(path.parent / row['file_path'])] = row
            if path.suffix.lower() in AUDIO_EXTENSIONS:
                paths.append(path)
            if path.suffix.lower() == '.zip':
                import zipfile
                with zipfile.ZipFile(path) as z:
                    members = [n for n in z.namelist() if Path(n).suffix.lower() in AUDIO_EXTENSIONS]
                archive_info.append({'path': str(path), 'audio_members': members})
    # Reserve private/challenge recordings even when a copy exists in a labeled folder.
    protected_hashes, excluded, corrupt, by_content = set(), [], [], {}
    for path in paths:
        if {'test_audio', 'challenge_set', 'custom_data'}.intersection(path.parts):
            try:
                protected_hashes.add(decoded_hash(path)[0])
            except Exception:
                pass
            excluded.append({'path': str(path), 'reason': 'Protected personal/challenge audio; not training data'})
    print(f'Audit: {len(paths)} audio paths; {len(regional)} regional manifest rows', flush=True)
    # Validate naming rules before the expensive audio pass.
    for path in paths:
        if not {'test_audio', 'challenge_set', 'custom_data'}.intersection(path.parts):
            identify(path, regional)
    byte_cache = {}
    for index, path in enumerate(paths):
        if {'test_audio', 'challenge_set', 'custom_data'}.intersection(path.parts):
            continue
        provenance = identify(path, regional)
        if provenance is None:
            excluded.append({'path': str(path), 'reason': 'No verified local label/provenance rule'})
            continue
        try:
            file_hash = digest_bytes(path)
            if file_hash in byte_cache:
                pcm_hash, duration = byte_cache[file_hash]
            else:
                pcm_hash, duration = decoded_hash(path)
                byte_cache[file_hash] = (pcm_hash, duration)
        except Exception as exc:
            corrupt.append({'path': str(path), 'error': str(exc)})
            continue
        if pcm_hash in protected_hashes:
            excluded.append({'path': str(path), 'reason': 'Duplicate of protected personal/challenge audio'})
            continue
        if duration < .75:
            excluded.append({'path': str(path), 'reason': 'Less than 0.75 seconds'})
            continue
        row = dict(path=str(path), sha256=file_hash, pcm_sha256=pcm_hash,
                   duration=duration, copies=[str(path)], **provenance)
        if row['source'] == 'legacy':
            # real_001 is a renumbered filename reused for unrelated recordings
            # across splits, not a speaker/conversation identifier.
            row['group'] = 'legacy:' + pcm_hash
        previous = by_content.get(pcm_hash)
        if previous:
            if previous['label'] != row['label']:
                raise ValueError(f'Conflicting labels on duplicate audio: {previous["path"]} / {path}')
            previous['copies'].append(str(path))
            previous['split'] = max([previous['split'], row['split']], key=PRIORITY.get)
            # Favor the deployable unified copy without depending on it for deduplication.
            if 'AureliaX-unified' in path.parts and 'AureliaX-unified' not in Path(previous['path']).parts:
                previous.update(path=str(path), sha256=file_hash)
        else:
            by_content[pcm_hash] = row
        if (index + 1) % 4000 == 0:
            print(f'Audited {index + 1}/{len(paths)} paths; {len(by_content)} unique', flush=True)
    rows = sorted(by_content.values(), key=lambda r: (r['source'], r['pcm_sha256']))
    group_splits = {}
    for r in rows:
        group_splits[r['group']] = max([r['split'], group_splits.get(r['group'], 'training')], key=PRIORITY.get)
    group_splits.update(benchmark_group_splits(rows))
    moves = []
    for row in rows:
        row['original_split'] = row['split']
        row['split'] = group_splits[row['group']]
        if row['split'] != row['original_split']:
            moves.append({k: row[k] for k in ['path', 'group', 'original_split', 'split']})
        row['id'] = row['pcm_sha256']
    report = dict(scanned_files=scanned_files, audio_paths=len(paths), unique_labeled=len(rows),
                  duplicate_copies=sum(len(r['copies']) - 1 for r in rows),
                  by_source_split_class=dict(collections.Counter(f'{r["source"]}/{r["split"]}/{r["label"]}' for r in rows)),
                  excluded=excluded, corrupt=corrupt, group_split_moves=moves, archives=archive_info,
                  limitation='Known conversation groups and exact decoded duplicates kept together. Local benchmark file splits rebuilt by conversation; official FLEURS and legacy/telephony holdouts retained. Missing speaker IDs prevent a speaker-disjoint claim.')
    write_json(manifest_path, rows)
    write_json(output / 'audit.json', report)
    write_json(output / 'run_config.json', dict(policy=POLICY, workspace=str(workspace),
               manifest_sha256=digest_bytes(manifest_path), seed=42, window_seconds=2,
               selection='Minimum validation source/class-balanced log loss; no test selection',
               calibration='Three-fold training-only grouped out-of-fold sigmoid calibration',
               threshold_policy='Validation maximum source false-positive / false-negative tails, with abstention'))
    print(json.dumps({k:v for k,v in report.items() if k not in ['excluded','corrupt','group_split_moves']}, indent=2), flush=True)


def representative_window(samples, sample_rate):
    # Deterministic, label-independent crop. No selecting windows using model scores.
    length = 2 * sample_rate
    start = max(0, (len(samples) - length) // 2)
    return np.asarray(samples[start:start + length], dtype=np.float32)


def extract(output, shard=0, shards=1):
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    import torch
    from audio_preprocessing import load_audio
    from wavlm_features import WavLMFeatureExtractor
    torch.set_num_threads(4)
    warnings.filterwarnings('ignore', message='Support for mismatched key_padding_mask.*')
    if not 0 <= shard < shards:
        raise ValueError('Invalid extraction shard')
    rows = json.loads((output / 'manifest.json').read_text(encoding='utf-8'))[shard::shards]
    extractor = WavLMFeatureExtractor()
    if shard == 0:
        write_json(output / 'feature_config.json', extractor.config_dict())
    feature_dir = output / 'features'
    feature_dir.mkdir(exist_ok=True)
    errors, started, extracted, cached = [], time.monotonic(), 0, 0
    # Test features may be extracted, but are never read by training/selection/calibration.
    for index, row in enumerate(rows):
        dest = feature_dir / (row['id'] + '.npy')
        if dest.exists():
            value = np.load(dest, allow_pickle=False)
            if value.shape != (6144,) or not np.isfinite(value).all():
                raise ValueError(f'Invalid feature cache {dest}')
            cached += 1
            continue
        try:
            path = Path(row['path'])
            if digest_bytes(path) != row['sha256']:
                raise ValueError('Source bytes changed after audit')
            audio = load_audio(path)
            if not audio.valid or audio.duration_seconds < .75:
                raise ValueError(audio.warning or 'Too short after preprocessing')
            samples = representative_window(audio.samples, audio.sample_rate)
            feature = extractor.extract_from_samples(samples, audio.sample_rate)
            if feature.shape != (6144,) or not np.isfinite(feature).all():
                raise ValueError('Invalid embedding')
            temporary = dest.with_suffix('.partial.npy')
            np.save(temporary, feature)
            temporary.replace(dest)
            extracted += 1
        except Exception as exc:
            errors.append(dict(id=row['id'], path=row['path'], error=str(exc)))
        if (index + 1) % 100 == 0 or index == len(rows)-1:
            elapsed = time.monotonic() - started
            progress = dict(processed=index+1, total=len(rows), extracted=extracted, cached=cached,
                            errors=len(errors), elapsed_seconds=round(elapsed,1),
                            estimated_remaining_seconds=round((len(rows)-index-1)*elapsed/max(1,extracted),1))
            write_json(output / f'progress_{shard}.json', progress)
            write_json(output / f'feature_errors_{shard}.json', errors)
            print(json.dumps(progress), flush=True)
    write_json(output / f'feature_errors_{shard}.json', errors)
    write_json(output / f'extraction_complete_{shard}.json',dict(rows=len(rows),errors=len(errors),shards=shards))


def balanced_weights(rows):
    """Equal class mass; balance sources/languages and cap tiny demo-source influence."""
    strata = [(r['label'], r['source'] + (':' + r['language'] if r['source']=='fleurs' else '')) for r in rows]
    counts = collections.Counter(strata)
    source_counts = collections.Counter((r['label'], r['source']) for r in rows)
    capacity = {k:min(1.,n/50.) for k,n in source_counts.items()}
    totals = {y:sum(v for (label,_),v in capacity.items() if label==y) for y in (0,1)}
    fleur_languages = max(1, len({s for _,s in strata if s.startswith('fleurs:')}))
    w = np.array([capacity[(y,s.split(':')[0])] / (counts[(y,s)] * totals[y] *
                  (fleur_languages if s.startswith('fleurs:') else 1)) for y,s in strata])
    return w * len(w) / w.sum()


def metrics(rows, scores, real=.4, fake=.6):
    from sklearn.metrics import confusion_matrix, roc_auc_score, log_loss
    y = np.array([r['label'] for r in rows])
    pred = (scores >= .5).astype(int)
    weights = balanced_weights(rows) if len(set(y))==2 else np.ones(len(y))
    result = dict(samples=len(rows), confusion_matrix=confusion_matrix(y,pred,labels=[0,1]).tolist(),
                  binary_accuracy=float(np.mean(pred==y)),
                  balanced_source_class_log_loss=float(log_loss(y,scores,sample_weight=weights,labels=[0,1])),
                  human_called_fake_rate=float(np.mean(scores[y==0]>=fake)) if np.any(y==0) else None,
                  fake_called_real_rate=float(np.mean(scores[y==1]<=real)) if np.any(y==1) else None,
                  abstention_rate=float(np.mean((scores>real)&(scores<fake))),
                  roc_auc=float(roc_auc_score(y,scores)) if len(set(y))==2 else None)
    return result


def report_metrics(rows, scores, real=.4, fake=.6):
    result = dict(overall=metrics(rows,scores,real,fake), by_source={}, fleurs_by_language={})
    for source in sorted({r['source'] for r in rows}):
        indices = [i for i,r in enumerate(rows) if r['source']==source]
        result['by_source'][source] = metrics([rows[i] for i in indices],scores[indices],real,fake)
    for language in sorted({r['language'] for r in rows if r['source']=='fleurs'}):
        indices = [i for i,r in enumerate(rows) if r['source']=='fleurs' and r['language']==language]
        result['fleurs_by_language'][language] = metrics([rows[i] for i in indices],scores[indices],real,fake)
    return result


def train(output):
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedGroupKFold
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler
    from threadpoolctl import threadpool_limits
    threadpool_limits(limits=4)
    if (output / 'classifier.joblib').exists():
        raise ValueError('Candidate already exists; refuse to retrain after test inspection')
    rows = json.loads((output / 'manifest.json').read_text(encoding='utf-8'))
    completions = [json.loads(p.read_text()) for p in output.glob('extraction_complete_*.json')]
    if not completions or sum(c['rows'] for c in completions) != len(rows):
        raise ValueError('All extraction shards must complete before training')
    feature_dir = output / 'features'
    usable = [r for r in rows if (feature_dir / (r['id'] + '.npy')).exists()]
    training = [r for r in usable if r['split']=='training']
    validation = [r for r in usable if r['split']=='validation']
    def matrix(subset):
        return np.vstack([np.load(feature_dir / (r['id']+'.npy'),allow_pickle=False) for r in subset])
    x, xv = matrix(training), matrix(validation)
    y = np.array([r['label'] for r in training])
    w = balanced_weights(training)
    def fit_model(c, xx, yy, ww):
        m = Pipeline([('scaler',StandardScaler()),('classifier',LogisticRegression(
            C=c,solver='lbfgs',max_iter=1500,random_state=42))])
        m.fit(xx,yy,classifier__sample_weight=ww)
        return m
    candidates, best_key, best, best_c = {}, float('inf'), None, None
    for c in [.0001,.001,.01,.1]:
        model = fit_model(c,x,y,w)
        scores = model.predict_proba(xv)[:,1]
        result = report_metrics(validation,scores)
        candidates[str(c)] = result
        key = result['overall']['balanced_source_class_log_loss']
        print('VALIDATION C=',c,json.dumps(result['overall']),flush=True)
        if key < best_key:
            best_key,best,best_c = key,model,c
    # Calibration is learned entirely from training folds, with scalers refit inside each fold.
    groups = np.array([r['group'] for r in training])
    folds = StratifiedGroupKFold(n_splits=3,shuffle=True,random_state=42)
    oof = np.zeros(len(training))
    for fold,(fit,cal) in enumerate(folds.split(x,y,groups)):
        if set(groups[fit]) & set(groups[cal]):
            raise ValueError('Group leakage in calibration')
        subset = [training[i] for i in fit]
        model = fit_model(best_c,x[fit],y[fit],balanced_weights(subset))
        oof[cal] = model.decision_function(x[cal])
        print('Calibration fold',fold+1,'complete',flush=True)
    calibrator = LogisticRegression(C=100,solver='lbfgs',random_state=42,max_iter=1000)
    calibrator.fit(oof.reshape(-1,1),y,sample_weight=w)
    slope, intercept = float(calibrator.coef_[0,0]), float(calibrator.intercept_[0])
    if slope <= 0:
        raise ValueError('Invalid calibration slope')
    final = copy.deepcopy(best)
    estimator = final.named_steps['classifier']
    estimator.coef_ *= slope
    estimator.intercept_ = estimator.intercept_ * slope + intercept
    validation_scores = final.predict_proba(xv)[:,1]
    # Choose a conservative uncertainty band on validation; never tune against test.
    real_tails, fake_tails = [], []
    for source in sorted({r['source'] for r in validation}):
        for label in (0,1):
            ids = [i for i,r in enumerate(validation) if r['source']==source and r['label']==label]
            if len(ids)>=10:
                if label==0:
                    fake_tails.append(float(np.quantile(validation_scores[ids],.95,method='higher')))
                else:
                    real_tails.append(float(np.quantile(validation_scores[ids],.05,method='lower')))
    real_threshold = min([.4]+real_tails)
    fake_threshold = max([.6]+fake_tails)
    thresholds = dict(real_if_fake_score_at_or_below=real_threshold,
                      fake_if_fake_score_at_or_above=fake_threshold,suspicious_between_thresholds=True)
    # Freeze artifact and validation report before loading any test feature.
    joblib.dump(final,output/'classifier.joblib')
    metadata = dict(project='AureliaX SIH local retraining',label_mapping={'REAL':0,'FAKE':1},
                    selected_classifier=f'source-balanced-logistic-C={best_c}-oof-sigmoid',
                    feature_config=json.loads((output/'feature_config.json').read_text()),
                    training_window_policy=POLICY, decision_thresholds=thresholds,
                    temperature=1.0,logit_bias=0.0,
                    calibration=dict(method='training-only grouped OOF sigmoid',slope=slope,intercept=intercept),
                    training=dict(training_source_files=len(training),validation_source_files=len(validation),
                                  custom_data_included=False,augmentation_copies=0),
                    manifest_sha256=digest_bytes(output/'manifest.json'),
                    classifier_sha256=digest_bytes(output/'classifier.joblib'),
                    warning='Scores are not guarantees. Regional fake speech is absent; unknown speaker overlap remains possible. Benchmark source groups were held together; no test tuning.')
    write_json(output/'metadata.json',metadata)
    write_json(output/'validation_report.json',dict(candidates=candidates,selected_C=best_c,
               calibrated=report_metrics(validation,validation_scores,real_threshold,fake_threshold)))
    testing = [r for r in usable if r['split']=='testing']
    xt = matrix(testing)
    scores = final.predict_proba(xt)[:,1]
    old = joblib.load(BACKEND/'models/voiceshield_wavlm/classifier.joblib')
    old_meta = json.loads((BACKEND/'models/voiceshield_wavlm/metadata.json').read_text())
    logits = (old.decision_function(xt) + old_meta.get('logit_bias',0))/old_meta.get('temperature',1)
    old_scores = 1/(1+np.exp(-np.clip(logits,-700,700)))
    old_t = old_meta['decision_thresholds']
    test_report = dict(candidate=report_metrics(testing,scores,real_threshold,fake_threshold),
                       previous=report_metrics(testing,old_scores,old_t['real_if_fake_score_at_or_below'],old_t['fake_if_fake_score_at_or_above']),
                       limitation='Held-out for this candidate. Some recordings were used by previous model development; not an external benchmark. One deterministic central 2-second window per recording.')
    write_json(output/'test_report.json',test_report)
    with (output/'test_predictions.csv').open('w',newline='',encoding='utf-8') as f:
        writer=csv.DictWriter(f,fieldnames=['path','source','language','label','candidate_score','previous_score'])
        writer.writeheader()
        for row,new_score,old_score in zip(testing,scores,old_scores):
            writer.writerow({**{k:row[k] for k in ['path','source','language','label']},
                             'candidate_score':float(new_score),'previous_score':float(old_score)})
    print('TRAINING COMPLETE',json.dumps(dict(selected_C=best_c,thresholds=thresholds,
          candidate=test_report['candidate']['overall'],previous=test_report['previous']['overall'])),flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage',choices=['audit','extract','train'])
    parser.add_argument('--workspace',type=Path,default=Path('C:/SIH'))
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--shard',type=int,default=0)
    parser.add_argument('--shards',type=int,default=1)
    args=parser.parse_args()
    if args.stage=='audit': audit(args.workspace.resolve(),args.output.resolve())
    elif args.stage=='extract': extract(args.output.resolve(),args.shard,args.shards)
    else: train(args.output.resolve())


if __name__=='__main__':
    main()
