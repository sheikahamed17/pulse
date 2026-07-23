-- Per-task mute for the daily overdue re-nudge. NULL = nudging active.
ALTER TABLE tasks ADD COLUMN nudge_muted_at TEXT;
