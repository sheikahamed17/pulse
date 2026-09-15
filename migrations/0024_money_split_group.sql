-- Group id shared by the N money entries that make up one split payment.
-- Nullable: a normal (non-split) entry has NULL. No index (grouping is in-memory).
-- Apply to remote: wrangler d1 execute pulse --remote --command "ALTER TABLE money_entries ADD COLUMN split_group_id TEXT"
ALTER TABLE money_entries ADD COLUMN split_group_id TEXT;
