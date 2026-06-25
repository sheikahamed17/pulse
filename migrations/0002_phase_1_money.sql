-- Phase 1: voice + money domain
-- All tables use snake_case + per-field HLC JSON to match the Phase 0 sync engine.
-- Additive only: Phase 0 tables (user, session, account, verification, devices,
-- op_log, widgets) are unchanged.

CREATE TABLE IF NOT EXISTS categories (
  id            TEXT    PRIMARY KEY NOT NULL,
  user_id       TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  kind          TEXT    NOT NULL CHECK (kind IN ('spend', 'income')),
  icon          TEXT,
  color         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_archived   INTEGER NOT NULL DEFAULT 0,
  field_hlcs    TEXT    NOT NULL,
  deleted_at    TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  UNIQUE (user_id, name, kind)
);

CREATE INDEX IF NOT EXISTS idx_categories_user_kind ON categories(user_id, kind);

CREATE TABLE IF NOT EXISTS recurring_rules (
  id                  TEXT    PRIMARY KEY NOT NULL,
  user_id             TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount              INTEGER NOT NULL,
  currency            TEXT    NOT NULL DEFAULT 'INR',
  direction           TEXT    NOT NULL CHECK (direction IN ('out', 'in')),
  category_id         TEXT    REFERENCES categories(id),
  description         TEXT,
  period              TEXT    NOT NULL CHECK (period IN ('daily','weekly','monthly','yearly')),
  interval_count      INTEGER NOT NULL DEFAULT 1,
  anchor_at           TEXT    NOT NULL,
  next_due_at         TEXT    NOT NULL,
  end_condition_kind  TEXT    NOT NULL DEFAULT 'never' CHECK (end_condition_kind IN ('never','until','count')),
  end_until           TEXT,
  end_count           INTEGER,
  occurrences_so_far  INTEGER NOT NULL DEFAULT 0,
  is_active           INTEGER NOT NULL DEFAULT 1,
  field_hlcs          TEXT    NOT NULL,
  deleted_at          TEXT,
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recurring_due
  ON recurring_rules(next_due_at)
  WHERE is_active = 1 AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS money_entries (
  id                 TEXT    PRIMARY KEY NOT NULL,
  user_id            TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount             INTEGER NOT NULL,
  currency           TEXT    NOT NULL DEFAULT 'INR',
  direction          TEXT    NOT NULL CHECK (direction IN ('out', 'in')),
  category_id        TEXT    REFERENCES categories(id),
  description        TEXT,
  occurred_at        TEXT    NOT NULL,
  source             TEXT    NOT NULL CHECK (source IN ('voice', 'manual', 'recurring')),
  raw_input          TEXT,
  recurring_rule_id  TEXT    REFERENCES recurring_rules(id),
  field_hlcs         TEXT    NOT NULL,
  deleted_at         TEXT,
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_money_user_occurred  ON money_entries(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_money_user_recurring ON money_entries(user_id, recurring_rule_id);
