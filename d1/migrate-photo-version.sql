-- Adds homesites.photo_version, a counter bumped on every photo write so the
-- client can append a cache-busting ?v= token to the photo URL. Apply once to
-- any database created before this column existed (fresh DBs get it from
-- schema.sql). Idempotent guard isn't available for ALTER TABLE ADD COLUMN in
-- SQLite, so running this twice errors harmlessly ("duplicate column name").
ALTER TABLE homesites ADD COLUMN photo_version INTEGER NOT NULL DEFAULT 0;
