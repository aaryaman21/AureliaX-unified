from .audio import verify_wav


def check_integrity(rows, root, verify_audio=True):
    seen_hashes, seen_paths, speakers = {}, set(), {}
    rows_by_path = {r['file_path']: r for r in rows}
    missing_speakers = 0
    for row in rows:
        if row['label'] not in (0, 1, '0', '1'):
            raise ValueError('Only binary human/AI labels are valid')
        if row['class_name'] != ('human' if int(row['label']) == 0 else 'ai_generated'):
            raise ValueError('Label and class_name disagree')
        if row['source_dataset'] == 'FLEURS' and int(row['label']) != 0:
            raise ValueError('FLEURS must be human')
        if int(row['sample_rate']) != 16000:
            raise ValueError('Sample-rate metadata must match standardized audio')
        if row['split'] not in ('train', 'validation', 'test') or row['original_split'] != row['split']:
            raise ValueError('Original split was changed')
        if row['file_path'] in seen_paths or row['pcm_sha256'] in seen_hashes:
            raise ValueError('Duplicate file or standardized audio')
        seen_paths.add(row['file_path'])
        seen_hashes[row['pcm_sha256']] = row['split']
        path = (root / row['file_path']).resolve()
        if not path.is_relative_to(root.resolve()):
            raise ValueError('Audio path escapes dataset root')
        if verify_audio:
            info = verify_wav(path, row['pcm_sha256'])
            if abs(info.duration - float(row['duration_seconds'])) > 1 / 16000:
                raise ValueError('Duration metadata mismatch')
        if row['speaker_id']:
            key = (row['source_dataset'], row['speaker_id'])
            if key in speakers and speakers[key] != row['split']:
                raise ValueError('Speaker crosses splits')
            speakers[key] = row['split']
        else:
            missing_speakers += 1
        if row['augmentation'] != 'none':
            parent = rows_by_path.get(row['parent_file'])
            if not parent or parent['split'] != row['split'] or int(parent['label']) != int(row['label']):
                raise ValueError('Derivative changes split/label or has no parent')
            if row['split'] != 'train':
                raise ValueError('Augmentation is permitted only on training data')
    return {'checked_recordings': len(rows), 'rows_without_speaker_id': missing_speakers,
            'exact_pcm_duplicates': 0, 'split_violations': 0,
            'speaker_audit': 'Only available IDs checked; original FLEURS splits retained. No inferred IDs.'}
