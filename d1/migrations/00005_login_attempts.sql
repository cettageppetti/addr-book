-- Rolling-window failed-login counter for rate limiting (one row per email).
CREATE TABLE IF NOT EXISTS login_attempts (
  email        TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL          -- unix ms when the current window began
);
