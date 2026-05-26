import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import * as jose from 'jose'
import bcrypt from 'bcryptjs'

type Env = {
  DB: D1Database
  JWT_SECRET: string
  // Comma-separated list of origins allowed to make credentialed requests.
  ALLOWED_ORIGINS?: string
}

const app = new Hono<{ Bindings: Env }>()

// Restrict CORS to an explicit allowlist. Reflecting an arbitrary origin with
// credentials:true would let any website make authenticated requests on a
// logged-in user's behalf. Same-origin app traffic is unaffected (browsers
// don't apply CORS to it).
app.use('*', cors({
  origin: (origin, c) => {
    const allowed = (c.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    return allowed.includes(origin) ? origin : null
  },
  credentials: true,
}))

// ── Helpers ─────────────────────────────────────────
async function getUserFromCookie(c: any) {
  // Check Bearer token first (Authorization header), then cookie
  const authHeader = c.req.header('authorization')
  let token: string | undefined
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  } else {
    token = getCookie(c, 'token')
  }
  if (!token) return null
  try {
    const payload = await jose.jwtVerify(token, new TextEncoder().encode(c.env.JWT_SECRET))
    return payload.payload as { id: number; email: string; role: string; resident_id: number }
  } catch {
    return null
  }
}

async function signToken(payload: object, secret: string): Promise<string> {
  return new jose.SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(new TextEncoder().encode(secret))
}

// D1 query helpers
async function queryAll(db: D1Database, sql: string, bindings?: (string | number)[]) {
  let stmt = db.prepare(sql)
  if (bindings?.length) stmt = stmt.bind(...bindings)
  return stmt.all()
}

async function queryOne(db: D1Database, sql: string, bindings?: (string | number)[]) {
  let stmt = db.prepare(sql)
  if (bindings?.length) stmt = stmt.bind(...bindings)
  return stmt.first()
}

// Admin-configurable defaults (e.g. neighborhood city/state/zip).
const SETTINGS_KEYS = ['default_city', 'default_state', 'default_zip_code'] as const

async function getSettings(db: D1Database): Promise<Record<string, string>> {
  const rows = await queryAll(db, 'SELECT key, value FROM settings')
  const out: Record<string, string> = {}
  for (const r of (rows.results || []) as any[]) out[r.key] = r.value
  return out
}

// ── Routes ─────────────────────────────────────────

// Login rate limiting: after MAX failures within WINDOW for a given email,
// reject further attempts until the window passes. Keyed by email (per-account)
// so one attacker can't lock out unrelated users; a successful login clears it.
const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000

// POST /api/auth/login
app.post('/api/auth/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

  const key = String(email).toLowerCase()
  const now = Date.now()
  // Prune expired counters so the table can't grow unbounded.
  await c.env.DB.prepare('DELETE FROM login_attempts WHERE window_start < ?').bind(now - LOGIN_WINDOW_MS).run()
  const rec = (await queryOne(c.env.DB,
    'SELECT failed_count, window_start FROM login_attempts WHERE email = ?', [key])) as
    { failed_count: number; window_start: number } | null
  const inWindow = !!rec && now - rec.window_start < LOGIN_WINDOW_MS

  if (inWindow && rec!.failed_count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((LOGIN_WINDOW_MS - (now - rec!.window_start)) / 1000)
    return c.json({ error: 'Too many failed attempts. Try again later.' }, 429, {
      'Retry-After': String(retryAfter),
    })
  }

  const user = await queryOne(c.env.DB,
    'SELECT * FROM users WHERE email = ?', [email])

  if (!user || !bcrypt.compareSync(password, user.password_hash as string)) {
    // Record the failure (start a fresh window if there isn't an active one).
    if (inWindow) {
      await c.env.DB.prepare('UPDATE login_attempts SET failed_count = failed_count + 1 WHERE email = ?').bind(key).run()
    } else {
      await c.env.DB.prepare(
        'INSERT INTO login_attempts (email, failed_count, window_start) VALUES (?, 1, ?) ' +
        'ON CONFLICT(email) DO UPDATE SET failed_count = 1, window_start = excluded.window_start'
      ).bind(key, now).run()
    }
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  // Successful login clears the failure counter for this email.
  await c.env.DB.prepare('DELETE FROM login_attempts WHERE email = ?').bind(key).run()

  const token = await signToken(
    { id: user.id, email: user.email, role: user.role, resident_id: user.resident_id },
    c.env.JWT_SECRET
  )

  setCookie(c, 'token', token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
  })

  return c.json({
    id: user.id, email: user.email, role: user.role, resident_id: user.resident_id,
    must_change_password: user.must_change_password ? 1 : 0,
    token,
  })
})

// POST /api/auth/logout
app.post('/api/auth/logout', async (c) => {
  deleteCookie(c, 'token')
  return c.json({ ok: true })
})

// GET /api/auth/me
app.get('/api/auth/me', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  // Read the flag live so it reflects a password change made this session.
  const row = await queryOne(c.env.DB, 'SELECT must_change_password FROM users WHERE id = ?', [user.id])
  return c.json({
    id: user.id, email: user.email, role: user.role, resident_id: user.resident_id,
    must_change_password: row && (row as any).must_change_password ? 1 : 0,
  })
})

// GET /api/auth/setup-state — public. True only while the seeded default admin
// is still on its temporary password, so the login screen can show the
// first-time credentials hint (and hide it for good once the admin changes it).
app.get('/api/auth/setup-state', async (c) => {
  const row = await queryOne(c.env.DB,
    "SELECT 1 FROM users WHERE email = 'admin@addrbook.local' AND must_change_password = 1")
  return c.json({ needs_setup: !!row })
})

// POST /api/homesites  (admin only)
app.post('/api/homesites', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  const { street_number, street_name, city, state, zip_code, residents } = await c.req.json()
  if (!street_number?.trim() || !street_name?.trim()) {
    return c.json({ error: 'street_number and street_name are required' }, 400)
  }

  const s = await getSettings(c.env.DB)
  const result = await c.env.DB.prepare(
    'INSERT INTO homesites (street_number, street_name, city, state, zip_code) VALUES (?, ?, ?, ?, ?)'
  ).bind(street_number.trim(), street_name.trim(), city?.trim() || s.default_city || '', state?.trim() || s.default_state || '', zip_code?.trim() || s.default_zip_code || '').run()

  // Optionally create the residents who live here (names only — contacts added
  // later). Each entry may be a comma-separated list, so "Bob Engle, Jane Engle"
  // becomes two residents.
  if (Array.isArray(residents)) {
    const names = residents
      .flatMap((rn: any) => String(rn ?? '').split(','))
      .map((n: string) => n.trim())
      .filter(Boolean)
    for (const n of names) {
      await c.env.DB.prepare('INSERT INTO residents (homesite_id, name) VALUES (?, ?)').bind(result.meta.last_row_id, n).run()
    }
  }

  const home = await queryOne(c.env.DB, 'SELECT * FROM homesites WHERE id = ?', [result.meta.last_row_id])
  return c.json(home as any, 201)
})

// PUT /api/homesites/:id  (admin only)
app.put('/api/homesites/:id', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const { street_number, street_name, city, state, zip_code } = await c.req.json()
  if (!street_number?.trim() || !street_name?.trim()) {
    return c.json({ error: 'street_number and street_name are required' }, 400)
  }

  const s = await getSettings(c.env.DB)
  await c.env.DB.prepare(
    'UPDATE homesites SET street_number = ?, street_name = ?, city = ?, state = ?, zip_code = ? WHERE id = ?'
  ).bind(street_number.trim(), street_name.trim(), city?.trim() || s.default_city || '', state?.trim() || s.default_state || '', zip_code?.trim() || s.default_zip_code || '', id).run()

  const home = await queryOne(c.env.DB, 'SELECT * FROM homesites WHERE id = ?', [id])
  return c.json(home as any)
})

// ── App settings (neighborhood defaults) ────────────────────────────────────

// GET /api/settings (admin only)
app.get('/api/settings', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
  const s = await getSettings(c.env.DB)
  return c.json({
    default_city: s.default_city ?? '',
    default_state: s.default_state ?? '',
    default_zip_code: s.default_zip_code ?? '',
  })
})

// PUT /api/settings (admin only) — upsert the provided keys
app.put('/api/settings', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
  const body = await c.req.json()
  for (const key of SETTINGS_KEYS) {
    if (key in body) {
      await c.env.DB.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ).bind(key, String(body[key] ?? '').trim()).run()
    }
  }
  const s = await getSettings(c.env.DB)
  return c.json({
    default_city: s.default_city ?? '',
    default_state: s.default_state ?? '',
    default_zip_code: s.default_zip_code ?? '',
  })
})

// ── Photo upload / serve ─────────────────────────────────────────

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_BYTES = 200 * 1024 // 200 KB

// GET /api/homesites/:id/photo — returns binary JPEG or 404
app.get('/api/homesites/:id/photo', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const row = await queryOne(c.env.DB, 'SELECT photo FROM homesites WHERE id = ?', [id])
  if (!row || !(row as any).photo) return c.json({ error: 'No photo' }, 404)

  const buf = (row as any).photo as ArrayBuffer
  return c.body(buf, 200, {
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'private, max-age=3600',
  })
})

// DELETE /api/homesites/:id/photo — removes photo (admin only)
app.delete('/api/homesites/:id/photo', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  await c.env.DB.prepare('UPDATE homesites SET photo = NULL WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// PUT /api/homesites/:id/photo — multipart upload (admin only)
app.put('/api/homesites/:id/photo', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const body = await c.req.raw.arrayBuffer()
  if (body.byteLength > MAX_BYTES) {
    return c.json({ error: `Photo too large (max ${MAX_BYTES / 1024} KB)` }, 400)
  }

  await c.env.DB.prepare('UPDATE homesites SET photo = ? WHERE id = ?').bind(body, id).run()
  return c.json({ ok: true })
})

// ── Residents CRUD (admin only) ─────────────────────────────────────────────

// GET /api/residents — neighborhood directory, visible to any logged-in user
app.get('/api/residents', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const rows = await queryAll(c.env.DB, `
    SELECT r.id, r.name, r.homesite_id,
           h.street_number || ' ' || h.street_name as homesite_address
    FROM residents r
    JOIN homesites h ON h.id = r.homesite_id
    ORDER BY h.street_number, h.street_name, r.name
  `)
  return c.json(rows.results || [])
})

// POST /api/residents  — create resident and assign to a homesite
app.post('/api/residents', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  const { name, homesite_id } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'name is required' }, 400)
  if (!homesite_id)    return c.json({ error: 'homesite_id is required' }, 400)

  // Verify homesite exists
  const home = await queryOne(c.env.DB, 'SELECT id FROM homesites WHERE id = ?', [homesite_id])
  if (!home) return c.json({ error: 'Homesite not found' }, 404)

  const result = await c.env.DB.prepare(
    'INSERT INTO residents (homesite_id, name, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
  ).bind(homesite_id, name.trim()).run()

  const resident = await queryOne(c.env.DB,
    `SELECT r.*, h.street_number, h.street_name
     FROM residents r JOIN homesites h ON h.id = r.homesite_id WHERE r.id = ?`,
    [result.meta.last_row_id])
  return c.json({ ...(resident as any), phones: [], emails: [] } as any, 201)
})

// PUT /api/residents/:id  — update name and/or reassign to different homesite
app.put('/api/residents/:id', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const { name, homesite_id } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'name is required' }, 400)

  // Verify target homesite exists (only if provided)
  let hId = homesite_id
  if (homesite_id != null) {
    const home = await queryOne(c.env.DB, 'SELECT id FROM homesites WHERE id = ?', [homesite_id])
    if (!home) return c.json({ error: 'Homesite not found' }, 404)
    hId = Number(homesite_id)
  } else {
    const current = await queryOne(c.env.DB, 'SELECT homesite_id FROM residents WHERE id = ?', [id])
    if (!current) return c.json({ error: 'Resident not found' }, 404)
    hId = current.homesite_id
  }

  await c.env.DB.prepare(
    'UPDATE residents SET name = ?, homesite_id = ? WHERE id = ?'
  ).bind(name.trim(), hId, id).run()

  const updated = await queryOne(c.env.DB,
    `SELECT r.*, h.street_number, h.street_name
     FROM residents r JOIN homesites h ON h.id = r.homesite_id WHERE r.id = ?`,
    [id])
  if (!updated) return c.json({ error: 'Not found' }, 404)

  const phones = await queryAll(c.env.DB, 'SELECT * FROM phones WHERE resident_id = ?', [id])
  const emails = await queryAll(c.env.DB, 'SELECT * FROM emails WHERE resident_id = ?', [id])
  return c.json({ ...(updated as any), phones: phones.results || [], emails: emails.results || [] } as any)
})

// DELETE /api/residents/:id  — cascade phones + emails
app.delete('/api/residents/:id', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  // Unlink any login account so it doesn't dangle on a deleted resident.
  await c.env.DB.prepare('UPDATE users SET resident_id = NULL WHERE resident_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM phones WHERE resident_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM emails WHERE resident_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM residents WHERE id = ?').bind(id).run()

  return c.json({ ok: true })
})

// ── Homesites CRUD ─────────────────────────────────────────────────────────

// DELETE /api/homesites/:id  (admin only)
app.delete('/api/homesites/:id', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  // Cascade delete residents + their contacts
  const resRows = await queryAll(c.env.DB, 'SELECT id FROM residents WHERE homesite_id = ?', [id])
  const rids = (resRows.results || []).map((r: any) => r.id)
  for (const rid of rids) {
    await c.env.DB.prepare('UPDATE users SET resident_id = NULL WHERE resident_id = ?').bind(rid).run()
    await c.env.DB.prepare('DELETE FROM phones WHERE resident_id = ?').bind(rid).run()
    await c.env.DB.prepare('DELETE FROM emails WHERE resident_id = ?').bind(rid).run()
  }
  await c.env.DB.prepare('DELETE FROM residents WHERE homesite_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM homesites WHERE id = ?').bind(id).run()

  return c.json({ ok: true })
})

// GET /api/homesites
app.get('/api/homesites', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  // Full neighborhood directory — every logged-in user sees all homesites.
  const sql = `
    SELECT h.id, h.street_number, h.street_name, h.city, h.state,
      (h.photo IS NOT NULL) AS has_photo,
      json_group_array(json_object('id', r.id, 'name', r.name)) FILTER (WHERE r.id IS NOT NULL) as residents_json,
      (SELECT MIN(r2.id) FROM residents r2 WHERE r2.homesite_id = h.id) as first_resident_id
    FROM homesites h
    LEFT JOIN residents r ON r.homesite_id = h.id
    GROUP BY h.id
    ORDER BY h.street_name COLLATE NOCASE, CAST(h.street_number AS INTEGER)
  `

  const homes = await queryAll(c.env.DB, sql)

  // Parse residents JSON array and pick first resident for backward compat
  const result = (homes.results || []).map((h: any) => {
    let residents = []
    try { residents = JSON.parse(h.residents_json || '[]') } catch {}
    return {
      ...h,
      residents,
      resident_names: residents.map((r: any) => r.name).join(', '),
      first_resident_id: h.first_resident_id,
    }
  })

  return c.json(result as any[])
})

// GET /api/residents/:id
app.get('/api/residents/:id', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  // Any logged-in user may view a resident profile (directory). Editing
  // contacts/address stays restricted in those endpoints.
  const resident = await queryOne(c.env.DB, `
    SELECT r.*, h.street_number, h.street_name,
           h.city AS homesite_city, h.state AS homesite_state, h.zip_code AS homesite_zip_code
    FROM residents r
    JOIN homesites h ON h.id = r.homesite_id
    WHERE r.id = ?
  `, [id])

  if (!resident) return c.json({ error: 'Not found' }, 404)

  const phones = await queryAll(c.env.DB, 'SELECT * FROM phones WHERE resident_id = ?', [id])
  const emails = await queryAll(c.env.DB, 'SELECT * FROM emails WHERE resident_id = ?', [id])

  return c.json({
    ...(resident as any),
    phones: (phones.results || []) as any[],
    emails: (emails.results || []) as any[],
  })
})

// PATCH /api/residents/:id/address
app.patch('/api/residents/:id/address', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  if (user.role !== 'admin' && user.resident_id !== id) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json()
  const allowed = ['address_street_number', 'address_street_name', 'address_city', 'address_state', 'address_zip_code']
  const updates: string[] = []
  const values: (string | number)[] = []

  for (const key of allowed) {
    if (key in body) {
      updates.push(`${key} = ?`)
      values.push(body[key] ?? '')
    }
  }

  if (updates.length === 0) {
    return c.json({ error: 'No address fields provided' }, 400)
  }

  values.push(id)
  await c.env.DB.prepare(
    `UPDATE residents SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run()

  const updated = await queryOne(c.env.DB, 'SELECT * FROM residents WHERE id = ?', [id])
  return c.json(updated as any)
})

// PUT /api/residents/:id/contacts
app.put('/api/residents/:id/contacts', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  if (user.role !== 'admin' && user.resident_id !== id) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const { phones, emails } = await c.req.json()

  // Validate + de-dupe before touching the DB so a bad value can't half-apply.
  let cleanPhones: string[] | null = null
  if (Array.isArray(phones)) {
    cleanPhones = [...new Set(phones.map((p: any) => String(p ?? '').trim()).filter(Boolean))]
    for (const num of cleanPhones) {
      if ((num.match(/\d/g) || []).length < 10) {
        return c.json({ error: `Invalid phone number: ${num}` }, 400)
      }
    }
  }

  let cleanEmails: string[] | null = null
  if (Array.isArray(emails)) {
    cleanEmails = [...new Set(emails.map((e: any) => String(e ?? '').trim()).filter(Boolean))]
    for (const addr of cleanEmails) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
        return c.json({ error: `Invalid email address: ${addr}` }, 400)
      }
    }
  }

  if (cleanPhones) {
    await c.env.DB.prepare('DELETE FROM phones WHERE resident_id = ?').bind(id).run()
    for (const num of cleanPhones) {
      await c.env.DB.prepare('INSERT INTO phones (resident_id, number) VALUES (?, ?)').bind(id, num).run()
    }
  }

  if (cleanEmails) {
    await c.env.DB.prepare('DELETE FROM emails WHERE resident_id = ?').bind(id).run()
    for (const addr of cleanEmails) {
      await c.env.DB.prepare('INSERT INTO emails (resident_id, address) VALUES (?, ?)').bind(id, addr).run()
    }
  }

  const newPhones = await c.env.DB.prepare('SELECT * FROM phones WHERE resident_id = ?').bind(id).all()
  const newEmails = await c.env.DB.prepare('SELECT * FROM emails WHERE resident_id = ?').bind(id).all()

  return c.json({
    phones: (newPhones.results || []) as any[],
    emails: (newEmails.results || []) as any[],
  })
})

// PUT /api/users/:id/password
app.put('/api/users/:id/password', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  if (user.role !== 'admin' && user.id !== id) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const { currentPassword, newPassword } = await c.req.json()
  if (!newPassword || newPassword.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  if (user.role !== 'admin') {
    const u = await queryOne(c.env.DB, 'SELECT password_hash, must_change_password FROM users WHERE id = ?', [id])
    if (!u) return c.json({ error: 'User not found' }, 404)
    // A user on the forced-change flag is replacing an admin-set temporary
    // password it never chose, so it sets a new one without the old. Normal
    // self-service changes still require the current password.
    if (!u.must_change_password) {
      if (!currentPassword || !bcrypt.compareSync(currentPassword, u.password_hash as string)) {
        return c.json({ error: 'Current password incorrect' }, 400)
      }
    }
  }

  const hash = bcrypt.hashSync(newPassword, 10)
  // Changing the password also clears any forced-change flag.
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').bind(hash, id).run()
  return c.json({ ok: true })
})

// ── Profile (self-service) ──────────────────────────────────────────────────

// PUT /api/auth/profile — update own email and/or password
app.put('/api/auth/profile', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const { email, password, currentPassword } = await c.req.json()

  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: 'Invalid email address' }, 400)
    }
    // Guard the UNIQUE(email) constraint so a clash is a 409, not a D1 500
    const clash = await queryOne(c.env.DB,
      'SELECT id FROM users WHERE email = ? AND id != ?', [email, user.id])
    if (clash) return c.json({ error: 'Email already in use' }, 409)
    await c.env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, user.id).run()
    // Re-issue the session cookie so it carries the new email — the JWT is
    // otherwise stale (still the old email) until the next login.
    const token = await signToken(
      { id: user.id, email, role: user.role, resident_id: user.resident_id },
      c.env.JWT_SECRET
    )
    setCookie(c, 'token', token, { httpOnly: true, sameSite: 'Lax', path: '/' })
  }

  if (password) {
    const u = await queryOne(c.env.DB, 'SELECT password_hash FROM users WHERE id = ?', [user.id])
    if (!u || !bcrypt.compareSync(currentPassword, u.password_hash as string)) {
      return c.json({ error: 'Current password incorrect' }, 400)
    }
    await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(bcrypt.hashSync(password, 10), user.id).run()
  }

  const updated = await queryOne(c.env.DB, 'SELECT id, email, role FROM users WHERE id = ?', [user.id])
  return c.json({ user: updated as any })
})

// ── Admin user management (admin only) ──────────────────────────────────────

// GET /api/admin/users — list users with their linked resident name
app.get('/api/admin/users', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  const rows = await queryAll(c.env.DB, `
    SELECT u.id, u.email, u.role, u.resident_id, u.must_change_password,
           r.name as resident_name
    FROM users u
    LEFT JOIN residents r ON u.resident_id = r.id
    ORDER BY u.role, u.email
  `)
  return c.json(rows.results || [])
})

// POST /api/admin/users — create a user linked to a resident
app.post('/api/admin/users', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  const { email, password, role = 'resident', resident_id } = await c.req.json()
  if (!email || !password || !resident_id) {
    return c.json({ error: 'email, password, and resident_id required' }, 400)
  }
  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  const resident = await queryOne(c.env.DB, 'SELECT id FROM residents WHERE id = ?', [resident_id])
  if (!resident) return c.json({ error: 'Resident not found' }, 404)
  const existing = await queryOne(c.env.DB, 'SELECT id FROM users WHERE email = ?', [email])
  if (existing) return c.json({ error: 'Email already in use' }, 409)
  const linked = await queryOne(c.env.DB, 'SELECT id FROM users WHERE resident_id = ?', [resident_id])
  if (linked) return c.json({ error: 'That resident already has an account' }, 409)

  // Admin-provisioned accounts get a temporary password — force a change on first login.
  const result = await c.env.DB.prepare(
    'INSERT INTO users (email, password_hash, role, resident_id, must_change_password) VALUES (?, ?, ?, ?, 1)'
  ).bind(email, bcrypt.hashSync(password, 10), role, resident_id).run()

  return c.json({ id: result.meta.last_row_id, email, role, resident_id }, 201)
})

// DELETE /api/admin/users/:id — remove a user (never your own account)
app.delete('/api/admin/users/:id', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)
  if (id === user.id) return c.json({ error: 'Cannot delete your own account' }, 400)

  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// POST /api/admin/users/:id/reset-password — set a new password for any user
app.post('/api/admin/users/:id/reset-password', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const { newPassword } = await c.req.json()
  if (!newPassword || newPassword.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(bcrypt.hashSync(newPassword, 10), id).run()
  return c.json({ ok: true })
})

// PUT /api/admin/users/:id/role — promote/demote (admin only)
app.put('/api/admin/users/:id/role', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)
  // Blocking self-changes also guarantees at least one admin always remains:
  // the last admin could only be demoted by themselves, which isn't allowed.
  if (id === user.id) return c.json({ error: 'You cannot change your own role' }, 400)

  const { role } = await c.req.json()
  if (role !== 'admin' && role !== 'resident') {
    return c.json({ error: "role must be 'admin' or 'resident'" }, 400)
  }

  const target = await queryOne(c.env.DB, 'SELECT must_change_password FROM users WHERE id = ?', [id])
  if (!target) return c.json({ error: 'User not found' }, 404)
  // Only promote established accounts — not ones still on an admin-set temp password.
  if (role === 'admin' && (target as any).must_change_password) {
    return c.json({ error: 'User must set their own password before being promoted to admin' }, 400)
  }

  await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, id).run()
  return c.json({ ok: true })
})

export default app