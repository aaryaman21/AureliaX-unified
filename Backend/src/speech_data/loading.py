"""Access only the official Hugging Face repository; pin its revision."""
import json

from datasets import Audio, get_dataset_config_names, load_dataset
from huggingface_hub import HfApi

from .config import DATASET_ID, LANGUAGES


def inspect_languages(destination):
    if destination.exists():
        result = json.loads(destination.read_text(encoding='utf-8'))
        if result['dataset_id'] != DATASET_ID:
            raise ValueError('The saved source is not official google/fleurs')
        return result
    revision = HfApi().dataset_info(DATASET_ID).sha
    available = sorted(get_dataset_config_names(DATASET_ID, revision=revision))
    selected = {name: code for name, code in LANGUAGES.items() if code in available}
    unavailable = {name: code for name, code in LANGUAGES.items() if code not in available}
    # Never silently substitute a regional variant for an unavailable config.
    result = {'dataset_id': DATASET_ID, 'revision': revision,
              'available_configs': available, 'selected': selected, 'unavailable': unavailable}
    destination.write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result


def stream_language(code, split, revision, state=None):
    if code not in LANGUAGES.values():
        raise ValueError(f'Not an allowed language: {code}')
    stream = load_dataset(DATASET_ID, code, split=split, revision=revision,
                          streaming=True, batch_size=16).cast_column('audio', Audio(decode=False))
    if state:
        stream.load_state_dict(state)
    return stream
