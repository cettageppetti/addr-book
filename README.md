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
users       — id, email, password_hash, role (resident/admin), resident_id
homesites   — id, street_number, street_name, city, state, zip_code, photo BLOB
residents   — id, homesite_id (FK), name
phones      — id, resident_id (FK), number
emails      — id, resident_id (FK), address
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate, sets httpOnly cookie |
| POST | `/api/auth/logout` | Clear cookie |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/homesites` | All (admin) or own homesite (resident) |
| GET | `/api/residents/:id` | Resident + phones + emails |
| GET  | `/api/homesites/:id/photo` | Binary JPEG photo (or 404) |
| PUT  | `/api/homesites/:id/photo` | Upload photo (binary, ≤200 KB JPEG) |
| DELETE | `/api/homesites/:id/photo` | Remove photo |
| PUT  | `/api/residents/:id/contacts` | Replace phones/emails |
| PUT  | `/api/users/:id/password` | Change password |

## Project Structure

```
addr-book/
├── worker/                  # Cloudflare Worker API
│   ├── src/index.ts         # Hono app with all routes
│   ├── wrangler.toml        # Worker config (D1 binding)
│   └── package.json
├── d1/                      # D1 schema + seed
│   ├── schema.sql           # Full schema (apply once to a fresh DB)
│   ├── seed.sql             # Pre-generated INSERT statements
│   └── setup.sh             # One-time local D1 setup script
└── src/                     # React frontend
    ├── App.tsx
    ├── pages/
    └── components/
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