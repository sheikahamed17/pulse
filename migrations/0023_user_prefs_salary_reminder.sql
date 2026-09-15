-- Opt-in flag for the monthly "log your salary" reminder (push on the last
-- working day of the month). Server-only, like the rest of user_prefs; 0 = off.
-- Apply to remote: wrangler d1 execute pulse --remote --command "ALTER TABLE user_prefs ADD COLUMN salary_reminder INTEGER NOT NULL DEFAULT 0"
ALTER TABLE user_prefs ADD COLUMN salary_reminder INTEGER NOT NULL DEFAULT 0;
