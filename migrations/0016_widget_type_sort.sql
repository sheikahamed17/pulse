-- Dashboard widgets: which card (`type`) and its position (`sort_order`).
ALTER TABLE widgets ADD COLUMN type TEXT;
ALTER TABLE widgets ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
