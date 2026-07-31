-- Hash of the personal SMS-ingest token (pulse_sms_{userId}_{secret}). NULL = none.
ALTER TABLE user_prefs ADD COLUMN sms_ingest_token_hash TEXT;
