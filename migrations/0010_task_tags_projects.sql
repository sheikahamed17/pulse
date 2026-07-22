-- Task organization: projects entity + task tags/project_id. Additive.
-- Applied to remote via (NOT --file; one statement per --command):
--   wrangler d1 execute pulse --remote --command "CREATE TABLE IF NOT EXISTS projects (...)"
--   wrangler d1 execute pulse --remote --command "CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)"
--   wrangler d1 execute pulse --remote --command "ALTER TABLE tasks ADD COLUMN tags TEXT"
--   wrangler d1 execute pulse --remote --command "ALTER TABLE tasks ADD COLUMN project_id TEXT"
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT    PRIMARY KEY NOT NULL,
  user_id     TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  color       TEXT,
  archived    INTEGER NOT NULL DEFAULT 0,
  field_hlcs  TEXT    NOT NULL,
  deleted_at  TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
ALTER TABLE tasks ADD COLUMN tags TEXT;
ALTER TABLE tasks ADD COLUMN project_id TEXT;
