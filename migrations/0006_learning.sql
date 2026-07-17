-- Learning domain: voice-first insight log
-- All tables additive; Phase 0-2 schema unchanged.

CREATE TABLE IF NOT EXISTS learning_entries (
  id                 TEXT    PRIMARY KEY NOT NULL,
  user_id            TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  text               TEXT    NOT NULL,
  tags               TEXT    NOT NULL DEFAULT '[]',    -- JSON array (whole-array LWW)
  attribution        TEXT,                              -- nullable origin (book/talk/…)
  source             TEXT    NOT NULL CHECK (source IN ('voice','manual')),
  occurred_at        TEXT    NOT NULL,
  field_hlcs         TEXT    NOT NULL,                  -- JSON Record<string,string>
  deleted_at         TEXT,
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_learning_user ON learning_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_user_occurred ON learning_entries(user_id, occurred_at);
