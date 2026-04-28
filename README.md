# Neighborhood Address Book

A React + Cloudflare Workers web application for managing neighborhood homesites and resident contact information.

## Two Ways to Run

### Option A — Cloudflare Stack (local dev, mirrors production)
This is the recommended workflow. Runs the actual Worker + D1 runtime locally.

```bash
# One-time setup: install worker deps and seed local D1
cd ~/Code/addr-book
npm install                           # project deps (frontend)
cd worker && npm install --ignore-scripts  # Worker deps
cd ..
bash d1/setup.sh                      # spins up local D1, runs migrations + seed

# Start developing
# Terminal 1: Worker API (port 8787)
cd ~/Code/addr-book/worker && npm run dev

# Terminal 2: Frontend (port 5173)
cd ~/Code/addr-book && npx vite
```

**URLs:**
- Frontend: http://localhost:5173
- API (Worker): http://localhost:8787

### Option B — Express + SQLite fallback
No Cloudflare account required. Pure local.
```bash
cd ~/Code/addr-book
npm install --ignore-scripts
node server.cjs              # seeds DB and starts on :3000
# Open http://localhost:3000 directly (Express serves the built frontend)
```

---

## Tech Stack

| Layer | Option A (Cloudflare) | Option B (Express) |
|-------|----------------------|-------------------|
| Frontend | React + Vite | Same |
| API | Cloudflare Worker (Hono) | Express.js |
| Database | D1 (SQLite, local via Wrangler) | SQLite (sql.js / better-sqlite3) |
| Auth | JWT in httpOnly cookies | Same |

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
├── src/                     # React frontend
│   ├── App.tsx
│   └── components/
└── server.cjs               # Express fallback (Option B)
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

# 4. Deploy worker
cd worker && wrangler deploy

# 5. Add pages project and configure route to worker
```

## Resetting Local D1

```bash
# Kill any running wrangler dev, then:
rm -rf ~/.wrangler/state/
bash d1/setup.sh
```

## Security

- Passwords hashed with bcrypt (cost 10)
- JWT tokens expire after 24h, stored in httpOnly cookies
- SameSite=Lax — change to Strict in production with HTTPS

## License

MIT