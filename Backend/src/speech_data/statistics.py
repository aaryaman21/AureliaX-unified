import json

from .config import SPLITS


def report(store, root, inspection, maximum, audit=None):
    rows = store.rows()
    stats = []
    for language, code in inspection['selected'].items():
        subset = [r for r in rows if r['language_code'] == code]
        stats.append({'language': language, 'language_code': code, 'samples': len(subset),
                      'hours': sum(r['duration_seconds'] for r in subset) / 3600,
                      **{split: sum(r['split'] == split for r in subset) for split in SPLITS}})
    legacy = {split: {label: len(list((root / split / label).glob('*.wav')))
                      for label in ('real', 'fake')} for split in ('training', 'validation', 'testing')}
    errors = dict(store.db.execute('SELECT kind,COUNT(*) FROM errors GROUP BY kind'))
    complete = all(s['samples'] == maximum for s in stats) and bool(stats)
    result = {'dataset_id': inspection['dataset_id'], 'revision': inspection['revision'],
              'target_per_language': maximum, 'target_reached': complete,
              'languages': stats, 'unavailable': inspection['unavailable'],
              'managed_class_distribution': {str(label): sum(int(r['label']) == label for r in rows) for label in (0, 1)},
              'legacy_dataset_files_not_in_new_manifest': legacy,
              'error_events': errors, 'integrity': audit,
              'training_performed': False}
    (root / 'fleurs_report.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    table = ['| Language | Human samples | Hours | Train | Validation | Test |',
             '|---|---:|---:|---:|---:|---:|']
    for s in stats:
        table.append(f'| {s["language"]} | {s["samples"]} | {s["hours"]:.3f} | {s["train"]} | {s["validation"]} | {s["test"]} |')
    text = '\n'.join(table)
    (root / 'FLEURS_COUNTS.md').write_text(text + '\n', encoding='utf-8')
    print(text, flush=True)
    print('Managed class counts:', result['managed_class_distribution'], flush=True)
    return result
