-- Force a password change on first login (e.g. the seeded admin's default).
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

-- Any existing admin is on the seeded default password — make them rotate it.
UPDATE users SET must_change_password = 1 WHERE role = 'admin';
