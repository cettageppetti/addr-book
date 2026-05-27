# Neighborhood Address Book

A React + Cloudflare Workers web application for managing neighborhood homesites and resident contact information.

## Running Locally

Runs the actual Worker + D1 runtime locally — mirrors production.

```bash
# One-time setup: install deps and seed local D1
npm install                                   # frontend deps
npm --prefix worker install --ignore-scripts  # Worker deps
bash d1/setup.sh                              # spins up local D1, applies schema + seed

# Start developing — Worker (:8787) + Vite (:5173) together
npm run dev
```

**URLs:**
- Frontend: http://localhost:5173
- API (Worker): http://localhost:8787

The Vite dev server proxies `/api` → `http://localhost:8787`, so develop against the frontend URL.

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React + Vite |
| API | Cloudflare Worker (Hono) |
| Database | D1 (SQLite, local via Wrangler) |
| Auth | JWT in httpOnly cookies |

## Default Credentials (local dev seed)

These are the **local** seed logins. The admin password is also the production
default — change it immediately on any deployment (see Deploying to Cloudflare).

- **Admin**: `admin@addrbook.local` / `ChangeThis123!`
- **Residents**: `resident1–120@addrbook.local` / `Resident123!`

## Database Schema

```
users          — id, email, password_hash, role (resident/admin), resident_id (FK), must_change_password
homesites      — id, street_number, street_name, city, state, zip_code, photo BLOB
residents      — id, homesite_id (FK), name, address_* (optional mailing address), created_at
phones         — id, resident_id (FK), number
emails         — id, resident_id (FK), address
settings       — key, value  (neighborhood defaults, community name, theme)
login_attempts — email, failed_count, window_start  (per-email login rate limiting)
```

## API Endpoints

All endpoints require authentication except those marked _(public)_; _(admin)_ marks admin-only.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate; sets an httpOnly cookie |
| POST | `/api/auth/logout` | Clear the session cookie |
| GET | `/api/auth/me` | Current user info |
| PUT | `/api/auth/profile` | Update own email and/or password |
| GET | `/api/auth/setup-state` | Whether first-time admin setup is pending _(public)_ |
| GET | `/api/site-info` | Community name + theme _(public)_ |
| GET | `/api/manifest.webmanifest` | PWA manifest, named/themed from settings _(public)_ |
| GET | `/api/settings` | Read neighborhood defaults, community name, theme _(admin)_ |
| PUT | `/api/settings` | Update settings _(admin)_ |
| GET | `/api/homesites` | Full directory — every logged-in user |
| POST | `/api/homesites` | Create a homesite (+ optional residents) _(admin)_ |
| PUT | `/api/homesites/:id` | Update a homesite _(admin)_ |
| DELETE | `/api/homesites/:id` | Delete a homesite _(admin)_ |
| GET | `/api/homesites/:id/photo` | Binary JPEG photo (or 404) |
| PUT | `/api/homesites/:id/photo` | Upload photo (binary, ≤200 KB JPEG) _(admin)_ |
| DELETE | `/api/homesites/:id/photo` | Remove photo _(admin)_ |
| GET | `/api/residents` | Full directory — every logged-in user |
| GET | `/api/residents/:id` | Resident + phones + emails |
| POST | `/api/residents` | Create a resident _(admin)_ |
| PUT | `/api/residents/:id` | Update a resident's name/homesite _(admin)_ |
| DELETE | `/api/residents/:id` | Delete a resident _(admin)_ |
| PUT | `/api/residents/:id/contacts` | Replace phones/emails (admin or the resident) |
| PATCH | `/api/residents/:id/address` | Update optional mailing address (admin or the resident) |
| GET | `/api/admin/users` | List login accounts _(admin)_ |
| POST | `/api/admin/users` | Create a login for a resident _(admin)_ |
| DELETE | `/api/admin/users/:id` | Delete a login account _(admin)_ |
| POST | `/api/admin/users/:id/reset-password` | Set a new password, forcing change _(admin)_ |
| PUT | `/api/admin/users/:id/role` | Promote/demote between resident and admin _(admin)_ |
| PUT | `/api/users/:id/password` | Change a password (self-service / forced first-login) |

## Project Structure

```
addr-book/
├── worker/                  # Cloudflare Worker — API + serves the built site
│   ├── src/index.ts         # Hono app: all /api routes + SPA fallback
│   ├── wrangler.toml        # Worker config (D1 + static-assets bindings)
│   └── package.json
├── d1/                      # D1 schema + seeds
│   ├── schema.sql           # Full schema (apply once to a fresh DB)
│   ├── seed.sql             # Demo dataset (120 homesites, ~350 residents)
│   ├── seed-admin.sql       # Admin-only seed (clean production start)
│   ├── generate-seed.cjs    # Regenerates seed.sql
│   └── setup.sh             # One-time local D1 setup script
├── src/                     # React frontend
│   ├── App.tsx
│   ├── pages/               # Home, Settings
│   ├── components/          # Layout, Login, ResidentProfile, HomesiteEditor, ui primitives
│   └── lib/                 # theme, site name, photo, auth helpers
├── tests/                   # Playwright API smoke suite
└── .github/workflows/       # CI (typecheck + build, API tests)
```

## Homesite Photos

Homesites support an optional photo stored as a binary JPEG BLOB in D1.
- Photos are compressed client-side (max 640px, quality 60%, ≤200 KB)
- Displayed via `<img src="/api/homesites/:id/photo">` — served as binary
- Admin-only upload, remove, and replace

## Deploying to Cloudflare

Deploys as a **single Worker** that serves both the API and the built React app
(via the `[assets]` binding in `worker/wrangler.toml`) — one origin, fits the
free tier.

**Prerequisites:** Node ≥22, a Cloudflare account, and `wrangler login`.

```bash
cd worker && npx wrangler login

# 1. Create YOUR OWN production D1 database, then copy the printed database_id
#    into worker/wrangler.toml (replace the existing id — it points at another
#    account's database).
npx wrangler d1 create addr-book

# 2. Create the tables in the remote database
npx wrangler d1 execute addr-book --remote --file=../d1/schema.sql

# 3. Seed the admin login only (recommended — onboard your neighborhood fresh).
npx wrangler d1 execute addr-book --remote --file=../d1/seed-admin.sql
#    Or load the full demo dataset instead: --file=../d1/seed.sql

# 4. Set the session-signing secret (generated locally, never shown)
openssl rand -base64 32 | npx wrangler secret put JWT_SECRET

# 5. Build the site, then deploy (the Worker serves dist/)
cd .. && npm run build
cd worker && npx wrangler deploy
```

Deploy prints your URL: `https://<worker-name>.<your-subdomain>.workers.dev`.

> **⚠️ Change the admin password immediately.** `ChangeThis123!` is public in
> this repo. Open your site, sign in as `admin@addrbook.local` — you'll be
> forced to set a new password — and do it **before sharing the URL**.

Notes:
- `ALLOWED_ORIGINS` (`worker/wrangler.toml` `[vars]`) only affects cross-origin
  API clients; the app is same-origin, so the default needs no change.
- Redeploy after changes with `npm run build` then `cd worker && npx wrangler deploy`.
- A custom domain can be attached in the Cloudflare dashboard.

## Resetting Local D1

```bash
# Kill any running wrangler dev, then:
rm -rf ~/.wrangler/state/
bash d1/setup.sh
```

## Resetting a forgotten admin password

There is no self-service password reset, so a locked-out admin is recovered
directly in the production database (requires `wrangler login`). This sets a
temporary password, forces a change at next login, and clears the login
rate-limit counter.

```bash
# From the repo root (after `npm install`).

# 1. Hash a temporary password — replace TEMP with one ≥10 characters
#    (you'll change it right after logging in):
node -e "console.log(require('bcryptjs').hashSync('TEMP', 10))"

# 2. Write the SQL, pasting the hash from step 1 in place of PASTE_HASH_HERE.
#    Using a file avoids shell-quoting issues with the '$' in bcrypt hashes:
cat > /tmp/reset.sql <<'SQL'
UPDATE users SET password_hash = 'PASTE_HASH_HERE', must_change_password = 1 WHERE email = 'admin@addrbook.local';
DELETE FROM login_attempts;
SQL

# 3. Apply to production, then remove the file:
cd worker && npx wrangler d1 execute addr-book --remote --file=/tmp/reset.sql && rm /tmp/reset.sql
```

Then sign in with the temporary password; you'll be required to set a new one
(min 10 characters). Omit `--remote` to run the same reset against the local dev DB.

## Security

- Passwords hashed with bcrypt (cost 10)
- Forced password change on first login for accounts on a temporary password —
  the seeded admin and any admin-created user must set a new password before using the app
- Login is rate-limited per email: 5 failed attempts within 15 min returns 429 (cleared on success)
- Auth is a JWT in an httpOnly, Secure, SameSite=Lax cookie (24h expiry) — the client never stores the token
- The seeded admin password (`ChangeThis123!`) is a **public default** — on any deployment, sign in and change it immediately (enforced by the forced first-login change)
- `JWT_SECRET` is a Wrangler secret (`wrangler secret put JWT_SECRET`); for local dev
  it's loaded from `worker/.dev.vars` (copy `worker/.dev.vars.example`, gitignored)
- CORS is restricted to an allowlist via `ALLOWED_ORIGINS` (worker/wrangler.toml `[vars]`)

## License

MIT