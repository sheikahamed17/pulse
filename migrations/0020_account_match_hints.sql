-- Add match_hints field to accounts for auto-detection during ingest.
ALTER TABLE accounts ADD COLUMN match_hints TEXT;
