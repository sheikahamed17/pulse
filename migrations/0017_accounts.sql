CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                 -- 'asset' | 'liability'
  opening_balance INTEGER NOT NULL DEFAULT 0,   -- minor units, account currency
  currency TEXT NOT NULL,
  icon TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  field_hlcs TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
ALTER TABLE money_entries ADD COLUMN account_id TEXT;
