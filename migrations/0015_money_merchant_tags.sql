-- First-class merchant + free tags on money entries.
-- merchant: counterparty/biller (the ingest agent already extracts this).
-- tags: JSON-encoded string[] (same convention as tasks/learning/notes).
ALTER TABLE money_entries ADD COLUMN merchant TEXT;
ALTER TABLE money_entries ADD COLUMN tags TEXT;
