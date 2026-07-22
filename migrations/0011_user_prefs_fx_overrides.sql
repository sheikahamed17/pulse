-- Manual FX overrides: fill-the-gap EUR→currency rates per user (JSON map). Additive.
-- Apply to remote: wrangler d1 execute pulse --remote --command "ALTER TABLE user_prefs ADD COLUMN fx_overrides TEXT"
ALTER TABLE user_prefs ADD COLUMN fx_overrides TEXT;
