-- addr-book D1 schema. Apply once to a fresh database, then load seed.sql.
-- (Consolidated from the original incremental migrations — pre-launch there is
-- no deployed data to migrate, so a single schema is simpler to apply.)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK(role IN ('resident', 'admin')) DEFAULT 'resident',
  resident_id INTEGER,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS homesites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  street_number TEXT NOT NULL,
  street_name TEXT NOT NULL,
  zip_code TEXT DEFAULT '28226',
  city TEXT DEFAULT 'Charlotte',
  state TEXT DEFAULT 'NC',
  photo BLOB,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS residents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  homesite_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  address_street_number TEXT,
  address_street_name TEXT,
  city TEXT,
  state TEXT,
  FOREIGN KEY (homesite_id) REFERENCES homesites(id)
);

CREATE TABLE IF NOT EXISTS phones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER NOT NULL,
  number TEXT NOT NULL,
  FOREIGN KEY (resident_id) REFERENCES residents(id)
);

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  FOREIGN KEY (resident_id) REFERENCES residents(id)
);

-- Rolling-window failed-login counter for rate limiting (one row per email).
CREATE TABLE IF NOT EXISTS login_attempts (
  email        TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL          -- unix ms when the current window began
);

CREATE INDEX IF NOT EXISTS idx_residents_homesite ON residents(homesite_id);
