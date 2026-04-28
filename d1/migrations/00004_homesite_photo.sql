-- Convert photo column from TEXT (base64) to BLOB (true binary)
-- First we need to drop and recreate since SQLite doesn't support ALTER COLUMN TYPE directly.
-- Data is lost — if photos exist, they'd need to be re-uploaded.

CREATE TABLE IF NOT EXISTS homesites_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  street_number TEXT NOT NULL,
  street_name TEXT NOT NULL,
  zip_code TEXT DEFAULT '28226',
  city TEXT DEFAULT 'Charlotte',
  state TEXT DEFAULT 'NC',
  photo BLOB,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO homesites_new (id, street_number, street_name, zip_code, city, state, created_at)
  SELECT id, street_number, street_name, zip_code,
         COALESCE(city, 'Charlotte'), COALESCE(state, 'NC'), created_at
  FROM homesites;

DROP TABLE homesites;
ALTER TABLE homesites_new RENAME TO homesites;