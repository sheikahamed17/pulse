-- Budgets: per-category monthly spending limits (standing config, one row per category).
-- Additive; previous migrations unchanged. budgets.id === category_id (1:1).

CREATE TABLE IF NOT EXISTS budgets (
  id                 TEXT    PRIMARY KEY NOT NULL,        -- === category_id
  user_id            TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  category_id        TEXT    NOT NULL,
  amount             INTEGER NOT NULL,                    -- minor units, in `currency`
  currency           TEXT    NOT NULL,
  field_hlcs         TEXT    NOT NULL,                    -- JSON Record<string,string>
  deleted_at         TEXT,
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_budget_user ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_user_category ON budgets(user_id, category_id);
