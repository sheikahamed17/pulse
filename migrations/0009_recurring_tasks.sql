-- Recurring tasks (after-completion model): a task carries its own cadence.
-- recur_period null = non-recurring. Applied to remote via (NOT --file, which 401s):
--   wrangler d1 execute pulse --remote --command "ALTER TABLE tasks ADD COLUMN recur_period TEXT"
--   wrangler d1 execute pulse --remote --command "ALTER TABLE tasks ADD COLUMN recur_interval INTEGER"
ALTER TABLE tasks ADD COLUMN recur_period TEXT;
ALTER TABLE tasks ADD COLUMN recur_interval INTEGER;
