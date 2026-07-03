-- Insights (op-log entity, LWW-materialized like tasks)
CREATE TABLE insights (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  period      TEXT NOT NULL CHECK (period IN ('weekly')),
  starts_at   TEXT NOT NULL,          -- ISO, inclusive week start (user-tz Monday as UTC)
  ends_at     TEXT NOT NULL,          -- ISO, exclusive
  summary     TEXT NOT NULL,          -- LLM narrative, <=2000 chars
  metrics     TEXT NOT NULL,          -- JSON: totals, top categories, task counts, skipped_currencies
  field_hlcs  TEXT NOT NULL,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_insights_user_start ON insights (user_id, starts_at DESC);

-- Push subscriptions (SERVER-ONLY, like user_prefs; never in the op-log)
CREATE TABLE push_subscriptions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_push_subs_user ON push_subscriptions (user_id);

-- Notification outbox (id doubles as the idempotency key)
CREATE TABLE push_notifications (
  id         TEXT PRIMARY KEY,        -- e.g. 'due-{task_id}-{due_at}', 'digest-{userId}-{weekStart}'
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  url        TEXT NOT NULL DEFAULT '/app',
  created_at TEXT NOT NULL,
  read_at    TEXT
);
CREATE INDEX idx_push_notif_user_unread ON push_notifications (user_id) WHERE read_at IS NULL;

-- Receipt link on money entries (rebuild incoming below)
PRAGMA defer_foreign_keys = on;

CREATE TABLE money_entries_new (
  id                 TEXT    PRIMARY KEY NOT NULL,
  user_id            TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount             INTEGER NOT NULL,
  currency           TEXT    NOT NULL DEFAULT 'INR',
  direction          TEXT    NOT NULL CHECK (direction IN ('out', 'in')),
  category_id        TEXT    REFERENCES categories(id),
  description        TEXT,
  occurred_at        TEXT    NOT NULL,
  source             TEXT    NOT NULL CHECK (source IN ('voice', 'manual', 'recurring', 'receipt')),
  receipt_key        TEXT,
  raw_input          TEXT,
  recurring_rule_id  TEXT    REFERENCES recurring_rules(id),
  field_hlcs         TEXT    NOT NULL,
  deleted_at         TEXT,
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
);

INSERT INTO money_entries_new (id, user_id, amount, currency, direction, category_id, description, occurred_at, source, receipt_key, raw_input, recurring_rule_id, field_hlcs, deleted_at, created_at, updated_at)
SELECT id, user_id, amount, currency, direction, category_id, description, occurred_at, source, NULL, raw_input, recurring_rule_id, field_hlcs, deleted_at, created_at, updated_at
FROM money_entries;

DROP TABLE money_entries;
ALTER TABLE money_entries_new RENAME TO money_entries;

CREATE INDEX idx_money_user_occurred  ON money_entries(user_id, occurred_at DESC);
CREATE INDEX idx_money_user_recurring ON money_entries(user_id, recurring_rule_id);
