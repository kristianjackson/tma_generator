CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_limits (
  user_id TEXT PRIMARY KEY,
  daily_limit INTEGER NOT NULL,
  tier TEXT,
  updated_at INTEGER NOT NULL
);
