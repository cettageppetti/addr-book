-- Minimal production seed: the default admin account only (no demo data).
-- Apply after d1/schema.sql for a clean instance you onboard from scratch.
--
-- Password is the repo default (ChangeThis123!) with must_change_password = 1,
-- so the first login forces a new password. This default is PUBLIC in this repo
-- — sign in and change it immediately, before sharing your site's URL.
INSERT INTO users (email, password_hash, role, must_change_password) VALUES ('admin@addrbook.local', '$2a$10$z0F8xlhZV2P2jbjHfM4IGuDkEf8578fajJW6Lbbj2lmksHWoAN4tG', 'admin', 1);
