-- addr-book D1 schema
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK(role IN ('resident', 'admin')) DEFAULT 'resident',
  resident_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS homesites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  street_number TEXT NOT NULL,
  street_name TEXT NOT NULL,
  zip_code TEXT DEFAULT '28226',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS residents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  homesite_id INTEGER NOT NULL,
  name TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_residents_homesite ON residents(homesite_id);