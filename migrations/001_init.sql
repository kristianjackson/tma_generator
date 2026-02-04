CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  season INTEGER,
  episode INTEGER,
  summary TEXT,
  content TEXT NOT NULL,
  source TEXT,
  word_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transcript_metadata (
  transcript_id TEXT PRIMARY KEY REFERENCES transcripts(id) ON DELETE CASCADE,
  fears_json TEXT,
  cast_json TEXT,
  themes_json TEXT,
  tags_json TEXT,
  locations_json TEXT
);

CREATE TABLE IF NOT EXISTS transcript_chunks (
  id TEXT PRIMARY KEY,
  transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  keywords_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS story_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  seed TEXT NOT NULL,
  filters_json TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS story_versions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES story_runs(id) ON DELETE CASCADE,
  version_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
