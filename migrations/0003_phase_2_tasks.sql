-- Phase 2: tasks domain + multi-currency FX + per-user preferences
-- All tables additive; Phase 0/1 schema (user, session, account, verification,
-- devices, op_log, widgets, categories, recurring_rules, money_entries) unchanged.

CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT    PRIMARY KEY NOT NULL,
  user_id       TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title         TEXT    NOT NULL,
  due_at        TEXT,                                                  -- ISO 8601 UTC, nullable
  priority      TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  completed_at  TEXT,                                                  -- ISO 8601 UTC; null = open
  source        TEXT    NOT NULL CHECK (source IN ('voice', 'manual')),
  raw_input     TEXT,
  field_hlcs    TEXT    NOT NULL,                                      -- JSON Record<string, hlc>
  deleted_at    TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_open
  ON tasks(user_id, due_at)
  WHERE completed_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_user_completed
  ON tasks(user_id, completed_at DESC)
  WHERE completed_at IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS fx_rates (
  date    TEXT    NOT NULL,                                            -- 'YYYY-MM-DD' (ECB UTC business day)
  base    TEXT    NOT NULL,                                            -- always 'EUR' from ECB
  target  TEXT    NOT NULL,                                            -- 'USD', 'INR', 'JPY', etc.
  rate    REAL    NOT NULL,                                            -- 1 EUR = `rate` units of target
  PRIMARY KEY (date, base, target)
);

CREATE INDEX IF NOT EXISTS idx_fx_target_date ON fx_rates(target, date DESC);

CREATE TABLE IF NOT EXISTS user_prefs (
  user_id           TEXT    PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  primary_currency  TEXT    NOT NULL DEFAULT 'INR',
  tz                TEXT    NOT NULL DEFAULT 'Asia/Kolkata',
  updated_at        TEXT    NOT NULL
);
