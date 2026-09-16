import csv
import json
import os
import sqlite3

FIELDS = ['file_path', 'label', 'class_name', 'language', 'language_code',
          'source_dataset', 'original_split', 'split', 'speaker_id', 'gender',
          'sample_rate', 'duration_seconds', 'quality_type', 'augmentation',
          'parent_file', 'source_id', 'original_filename', 'source_revision',
          'source_sha256', 'pcm_sha256', 'original_sample_rate',
          'original_channels', 'clipped_samples', 'preprocessing_version',
          'transcription', 'raw_transcription']


class Store:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('CREATE TABLE IF NOT EXISTS recordings (key TEXT PRIMARY KEY, pcm_hash TEXT UNIQUE, data TEXT NOT NULL)')
        self.db.execute('CREATE TABLE IF NOT EXISTS checkpoints (key TEXT PRIMARY KEY, data TEXT NOT NULL)')
        self.db.execute('CREATE TABLE IF NOT EXISTS errors (id INTEGER PRIMARY KEY, key TEXT, kind TEXT, message TEXT)')
        self.db.commit()

    def close(self):
        self.db.close()

    def rows(self):
        return [json.loads(r[0]) for r in self.db.execute('SELECT data FROM recordings ORDER BY key')]

    def get(self, key):
        row = self.db.execute('SELECT data FROM recordings WHERE key=?', (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def checkpoint(self, key):
        row = self.db.execute('SELECT data FROM checkpoints WHERE key=?', (key,)).fetchone()
        return json.loads(row[0]) if row else {'count': 0, 'seen': 0, 'done': False, 'stream': None}

    def commit(self, key, checkpoint, recording_key=None, row=None):
        with self.db:
            if row is not None:
                self.db.execute('INSERT INTO recordings VALUES (?, ?, ?)',
                                (recording_key, row['pcm_sha256'], json.dumps(row)))
            self.db.execute('INSERT OR REPLACE INTO checkpoints VALUES (?, ?)', (key, json.dumps(checkpoint)))

    def duplicate(self, pcm_hash):
        row = self.db.execute('SELECT data FROM recordings WHERE pcm_hash=?', (pcm_hash,)).fetchone()
        return json.loads(row[0]) if row else None

    def error(self, key, kind, message):
        with self.db:
            self.db.execute('INSERT INTO errors (key,kind,message) VALUES (?,?,?)', (key, kind, str(message)))

    def export(self, root):
        temporary = root / 'metadata.csv.tmp'
        with temporary.open('w', newline='', encoding='utf-8') as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(self.rows())
        os.replace(temporary, root / 'metadata.csv')
        with (root / 'errors.csv').open('w', newline='', encoding='utf-8') as handle:
            writer = csv.writer(handle)
            writer.writerow(['event_id', 'source', 'kind', 'message'])
            writer.writerows(self.db.execute('SELECT id,key,kind,message FROM errors ORDER BY id'))
