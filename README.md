# Neighborhood Address Book

A React + Cloudflare Workers web application for managing neighborhood homesites and resident contact information.

## Running Locally

Runs the actual Worker + D1 runtime locally — mirrors production.

```bash
# One-time setup: install deps and seed local D1
npm install                                   # frontend deps
npm --prefix worker install --ignore-scripts  # Worker deps
bash d1/setup.sh                              # spins up local D1, runs migrations + seed

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

## Default Credentials

- **Admin**: `admin@addrbook.local` / `ChangeThis123!`
- **Residents**: `resident1–120@addrbook.local` / `Resident123!`

## Database Schema

```
users       — id, email, password_hash, role (resident/admin), resident_id
homesites   — id, street_number, street_name, zip_code (28226), photo BLOB
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
├── d1/                      # D1 migrations + seed
│   ├── migrations/
│   │   └── 00001_initial.sql
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

```bash
# 1. Create production D1 database
wrangler d1 create addr-book
# Copy the database_id into worker/wrangler.toml

# 2. Apply schema migrations (in order)
wrangler d1 execute addr-book --remote --file=d1/migrations/00001_initial.sql
wrangler d1 execute addr-book --remote --file=d1/migrations/00004_homesite_photo.sql
# ↑ Run 00004 even with no photos — it changes the column type from TEXT to BLOB.

# 3. Seed production data
wrangler d1 execute addr-book --remote --file=d1/seed.sql

# 4. Set the JWT signing secret (prompts for the value — not stored in the repo)
cd worker && wrangler secret put JWT_SECRET

# 5. Set ALLOWED_ORIGINS to your frontend origin(s) in worker/wrangler.toml [vars]
#    (comma-separated), then deploy the worker
wrangler deploy

# 6. Add pages project and configure route to worker
```

## Resetting Local D1

```bash
# Kill any running wrangler dev, then:
rm -rf ~/.wrangler/state/
bash d1/setup.sh
```

## Security

- Passwords hashed with bcrypt (cost 10)
- Login is rate-limited per email: 5 failed attempts within 15 min returns 429 (cleared on success)
- Auth is a JWT in an httpOnly cookie (24h expiry) — the client never stores the token
- SameSite=Lax — change to Strict in production with HTTPS
- `JWT_SECRET` is a Wrangler secret (`wrangler secret put JWT_SECRET`); for local dev
  it's loaded from `worker/.dev.vars` (copy `worker/.dev.vars.example`, gitignored)
- CORS is restricted to an allowlist via `ALLOWED_ORIGINS` (worker/wrangler.toml `[vars]`)

## License

MIT