-- addr-book D1 schema. Apply once to a fresh database, then load seed.sql.
-- (Consolidated from the original incremental migrations — pre-launch there is
-- no deployed data to migrate, so a single schema is simpler to apply.)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK(role IN ('resident', 'admin')) DEFAULT 'resident',
  -- One account per resident; if the resident is deleted the account is unlinked, not orphaned.
  resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
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
  -- Optional mailing address (e.g. an owner who lives elsewhere); blank = use the homesite address.
  address_street_number TEXT,
  address_street_name TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip_code TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (homesite_id) REFERENCES homesites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS phones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER NOT NULL,
  number TEXT NOT NULL,
  FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE CASCADE
);

-- App-wide settings (key/value), e.g. the neighborhood address defaults an
-- admin sets so adding homesites doesn't require re-typing city/state/zip.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Rolling-window failed-login counter for rate limiting (one row per email).
CREATE TABLE IF NOT EXISTS login_attempts (
  email        TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL          -- unix ms when the current window began
);

CREATE INDEX IF NOT EXISTS idx_residents_homesite ON residents(homesite_id);
CREATE INDEX IF NOT EXISTS idx_phones_resident ON phones(resident_id);
CREATE INDEX IF NOT EXISTS idx_emails_resident ON emails(resident_id);
-- Enforces one account per resident (and indexes users.resident_id lookups).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_resident_id ON users(resident_id);
