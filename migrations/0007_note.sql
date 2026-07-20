-- Notes domain: voice-first quick capture
-- All tables additive; previous migrations unchanged.

CREATE TABLE IF NOT EXISTS note_entries (
  id                 TEXT    PRIMARY KEY NOT NULL,
  user_id            TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title              TEXT,                                -- nullable AI-suggested title
  body               TEXT    NOT NULL,                   -- verbatim input text
  tags               TEXT    NOT NULL DEFAULT '[]',      -- JSON array (whole-array LWW)
  source             TEXT    NOT NULL CHECK (source IN ('voice','manual')),
  occurred_at        TEXT    NOT NULL,
  field_hlcs         TEXT    NOT NULL,                   -- JSON Record<string,string>
  deleted_at         TEXT,
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_note_user ON note_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_note_user_occurred ON note_entries(user_id, occurred_at);
