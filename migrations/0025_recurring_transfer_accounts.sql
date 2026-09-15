-- Recurring transfers: when a recurring rule carries BOTH from/to account ids,
-- the recur cron materializes a `transfer` (not a money entry). Nullable — money
-- rules leave both NULL. Apply to remote (two ALTERs; batches of ALTERs are OK):
-- wrangler d1 execute pulse --remote --command "ALTER TABLE recurring_rules ADD COLUMN from_account_id TEXT; ALTER TABLE recurring_rules ADD COLUMN to_account_id TEXT"
ALTER TABLE recurring_rules ADD COLUMN from_account_id TEXT;
ALTER TABLE recurring_rules ADD COLUMN to_account_id TEXT;
