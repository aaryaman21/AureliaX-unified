import hashlib
import json
import logging
from pathlib import Path

from filelock import FileLock

from .audio import decode_audio, write_wav
from .config import DATASET_ID, POLICY_VERSION, SAMPLE_RATE, quotas
from .integrity import check_integrity
from .loading import inspect_languages, stream_language
from .metadata import Store
from .statistics import report

LOG = logging.getLogger(__name__)


def process_split(store, root, language, code, split, target, revision):
    checkpoint_key = f'{code}/{split}'
    checkpoint = store.checkpoint(checkpoint_key)
    if checkpoint['count'] >= target or checkpoint['done']:
        print(f'{checkpoint_key}: resume skip ({checkpoint["count"]} ready)', flush=True)
        return
    stream = stream_language(code, split, revision, checkpoint['stream'])
    iterator = iter(stream)
    gender_feature = stream.features.get('gender') if stream.features else None
    while checkpoint['count'] < target:
        try:
            record = next(iterator)
        except StopIteration:
            checkpoint['done'] = True
            store.commit(checkpoint_key, checkpoint)
            if checkpoint['count'] < target:
                store.error(checkpoint_key, 'insufficient_samples', f'{checkpoint["count"]}/{target} usable recordings')
            break
        # Do not catch transport/iterator failures as corrupt audio: checkpoint
        # stays at the last committed row and the split can be resumed.
        checkpoint['seen'] += 1
        audio = record.get('audio') or {}
        filename = Path(audio.get('path') or record.get('path') or '').name
        recording_key = f'{code}/{split}/{filename}'
        try:
            if not filename:
                raise ValueError('Recording has no stable filename')
            existing = store.get(recording_key)
            if existing:
                checkpoint['stream'] = stream.state_dict()
                store.commit(checkpoint_key, checkpoint)
                continue
            pcm, info = decode_audio(audio)
            duplicate = store.duplicate(info['pcm_sha256'])
            if duplicate:
                raise ValueError(f'Duplicate standardized PCM; already in {duplicate["file_path"]} split={duplicate["split"]}')
            stable_id = hashlib.sha256(recording_key.encode()).hexdigest()[:24]
            relative = f'human/{language}/{split}_{stable_id}.wav'
            gender = record.get('gender', '')
            if gender_feature is not None and hasattr(gender_feature, 'int2str') and gender != '':
                gender = gender_feature.int2str(gender)
            row = {'file_path': relative, 'label': 0, 'class_name': 'human',
                   'language': language, 'language_code': code, 'source_dataset': 'FLEURS',
                   'original_split': split, 'split': split,
                   'speaker_id': record.get('speaker_id') or '', 'gender': gender,
                   'sample_rate': SAMPLE_RATE, 'duration_seconds': len(pcm) / SAMPLE_RATE,
                   'quality_type': 'clean', 'augmentation': 'none', 'parent_file': '',
                   'source_id': record.get('id', ''), 'original_filename': filename,
                   'source_revision': revision, 'preprocessing_version': POLICY_VERSION,
                   'transcription': record.get('transcription', ''),
                   'raw_transcription': record.get('raw_transcription', ''), **info}
        except (ValueError, RuntimeError, OSError) as exc:
            # Log individual decode/format problems, then continue with other samples.
            LOG.warning('%s rejected: %s', recording_key, exc)
            store.error(recording_key, 'rejected_audio', str(exc))
            checkpoint['stream'] = stream.state_dict()
            store.commit(checkpoint_key, checkpoint)
            continue
        write_wav(root / relative, pcm)
        checkpoint['count'] += 1
        checkpoint['stream'] = stream.state_dict()
        store.commit(checkpoint_key, checkpoint, recording_key, row)
        if checkpoint['count'] % 50 == 0 or checkpoint['count'] == target:
            print(f'{checkpoint_key}: {checkpoint["count"]}/{target}', flush=True)
    store.export(root)


def run(root, maximum, requested=None, inspect_only=False, audit_only=False):
    root = Path(root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    with FileLock(root / '.fleurs.lock', timeout=1):
        logging.basicConfig(level=logging.WARNING,
                            handlers=[logging.FileHandler(root / 'fleurs.log', encoding='utf-8'), logging.StreamHandler()])
        inspection = inspect_languages(root / 'fleurs_languages.json')
        print('Validated official configurations:', inspection['selected'], flush=True)
        print('Unavailable:', inspection['unavailable'], flush=True)
        if inspect_only:
            return
        selected = inspection['selected']
        if requested:
            unknown = set(requested) - set(selected)
            if unknown:
                raise ValueError(f'Unavailable or invalid requested languages: {sorted(unknown)}')
            selected = {name: selected[name] for name in requested}
        config = {'dataset_id': DATASET_ID, 'revision': inspection['revision'],
                  'maximum': maximum, 'quotas': quotas(maximum), 'policy': POLICY_VERSION,
                  'sampling': 'first usable rows in pinned official order, separately within each original split'}
        config_path = root / 'fleurs_run.json'
        if config_path.exists() and json.loads(config_path.read_text()) != config:
            raise ValueError('Run settings changed. Use a separate dataset root to preserve resumability.')
        config_path.write_text(json.dumps(config, indent=2), encoding='utf-8')
        store = Store(root / 'fleurs_state.sqlite')
        failures = []
        try:
            # Verify existing outputs before any resumed downloads/conversions.
            check_integrity(store.rows(), root)
            if not audit_only:
                for language, code in selected.items():
                    for split, target in quotas(maximum).items():
                        try:
                            process_split(store, root, language, code, split, target, inspection['revision'])
                        except Exception as exc:
                            LOG.exception('Failed %s/%s; saved progress retained', code, split)
                            store.error(f'{code}/{split}', 'split_failure', str(exc))
                            failures.append(f'{code}/{split}: {exc}')
                    store.export(root)
            audit = check_integrity(store.rows(), root)
            store.export(root)
            result = report(store, root, inspection, maximum, audit)
            if failures:
                raise RuntimeError(f'{len(failures)} split(s) failed; see fleurs.log and errors.csv. Rerun to resume.')
            print('Preparation only; no training performed.', flush=True)
            return result
        finally:
            store.export(root)
            store.close()
