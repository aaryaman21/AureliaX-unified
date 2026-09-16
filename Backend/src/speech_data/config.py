from pathlib import Path

DATASET_ID = 'google/fleurs'
MAX_SAMPLES_PER_LANGUAGE = 1000
SAMPLE_RATE = 16000
POLICY_VERSION = 'speech-pcm16-v1'
PROJECT_ROOT = Path(__file__).resolve().parents[2]
LANGUAGES = {
    'english': 'en_us', 'assamese': 'as_in', 'bengali': 'bn_in',
    'gujarati': 'gu_in', 'hindi': 'hi_in', 'kannada': 'kn_in',
    'malayalam': 'ml_in', 'marathi': 'mr_in', 'odia': 'or_in',
    'punjabi': 'pa_in', 'tamil': 'ta_in', 'telugu': 'te_in',
    'urdu': 'ur_pk', 'sindhi': 'sd_in',
}
SPLITS = ('train', 'validation', 'test')


def quotas(total):
    if total < 3:
        raise ValueError('At least three samples per language are required')
    validation = max(1, int(total * .15))
    test = max(1, int(total * .15))
    return dict(zip(SPLITS, (total - validation - test, validation, test)))
