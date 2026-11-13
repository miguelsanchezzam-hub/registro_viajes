CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
--> statement-breakpoint
INSERT OR IGNORE INTO people (name)
  SELECT MIN(TRIM(name)) FROM trip_people
  WHERE TRIM(name) <> ''
  GROUP BY LOWER(TRIM(name));
--> statement-breakpoint
ALTER TABLE trip_people ADD COLUMN direction TEXT NOT NULL DEFAULT 'entra';
