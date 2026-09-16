"""Prepare only HUMAN/BONAFIDE FLEURS data from the official Hugging Face source."""
import argparse

from speech_data.config import MAX_SAMPLES_PER_LANGUAGE, PROJECT_ROOT
from speech_data.pipeline import run


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset-root', default=str(PROJECT_ROOT / 'dataset'))
    parser.add_argument('--max-samples-per-language', type=int, default=MAX_SAMPLES_PER_LANGUAGE)
    parser.add_argument('--languages', nargs='+', help='Language folder names, e.g. english hindi; default all validated target languages')
    parser.add_argument('--inspect-only', action='store_true', help='Validate official configs without downloading audio')
    parser.add_argument('--audit-only', action='store_true', help='Check existing files and rebuild metadata/statistics')
    args = parser.parse_args()
    run(args.dataset_root, args.max_samples_per_language, args.languages, args.inspect_only, args.audit_only)


if __name__ == '__main__':
    main()
