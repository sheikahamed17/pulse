-- Sub-tasks: a task may reference a parent task. One level (enforced in UI). Additive.
-- Apply to remote: wrangler d1 execute pulse --remote --command "ALTER TABLE tasks ADD COLUMN parent_id TEXT"
ALTER TABLE tasks ADD COLUMN parent_id TEXT;
