"""Assign 70/15/15 group splits to new data; preserve explicit legacy splits.

Input CSV: path,label,group,source,split (split may be blank).
Group must be a connected component of shared speakers/source conversations.
"""
import argparse
import csv
from pathlib import Path

from sklearn.model_selection import GroupShuffleSplit

from train_combined import read_manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('provenance')
    parser.add_argument('--output', default='combined_manifest.csv')
    args = parser.parse_args()
    output = Path(args.output)
    if output.exists():
        raise ValueError('Output already exists; use a new manifest filename')
    with Path(args.provenance).open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    pending = [r for r in rows if not r.get('split', '').strip()]
    if pending:
        groups = [r['group'] for r in pending]
        if len(set(groups)) < 7:
            raise ValueError('At least seven independent groups are required for a three-way split')
        train, remaining = next(GroupShuffleSplit(n_splits=1, train_size=.70, random_state=42).split(pending, groups=groups))
        rest_groups = [groups[i] for i in remaining]
        validation, testing = next(GroupShuffleSplit(n_splits=1, test_size=.50, random_state=42).split(remaining, groups=rest_groups))
        for indices, split in [(train, 'training'), ([remaining[i] for i in validation], 'validation'),
                               ([remaining[i] for i in testing], 'testing')]:
            for i in indices:
                pending[i]['split'] = split
    with output.open('x', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=['path', 'label', 'group', 'split', 'source'])
        writer.writeheader()
        writer.writerows(rows)
    read_manifest(output)
    print('Validated manifest:', output)


if __name__ == '__main__':
    main()
