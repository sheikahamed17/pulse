CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  icon TEXT,
  account_id TEXT,
  saved_amount INTEGER NOT NULL DEFAULT 0,
  target_date TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  field_hlcs TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
