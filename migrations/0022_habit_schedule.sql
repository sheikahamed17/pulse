-- Add schedule field to habits for weekday-specific scheduling.
ALTER TABLE habits ADD COLUMN schedule TEXT;
