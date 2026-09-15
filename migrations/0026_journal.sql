-- Journal domain: a daily journal entry (free text + optional mood). New
-- persisted entity_kind 'journal'; op-log + per-field HLC LWW like the rest.
-- Apply to remote: wrangler d1 execute pulse --remote --command "<the CREATE TABLE>"
-- then the CREATE INDEX (one statement at a time).
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  mood TEXT,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL,
  field_hlcs TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user ON journal_entries(user_id);
