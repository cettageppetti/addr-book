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

// POST /api/homesites  (admin only)
app.post('/api/homesites', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  const { street_number, street_name, city, state, zip_code } = await c.req.json()
  if (!street_number?.trim() || !street_name?.trim()) {
    return c.json({ error: 'street_number and street_name are required' }, 400)
  }

  const result = await c.env.DB.prepare(
    'INSERT INTO homesites (street_number, street_name, city, state, zip_code) VALUES (?, ?, ?, ?, ?)'
  ).bind(street_number.trim(), street_name.trim(), city?.trim() || 'Charlotte', state?.trim() || 'NC', zip_code?.trim() || '28226').run()

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

  await c.env.DB.prepare(
    'UPDATE homesites SET street_number = ?, street_name = ?, city = ?, state = ?, zip_code = ? WHERE id = ?'
  ).bind(street_number.trim(), street_name.trim(), city?.trim() || 'Charlotte', state?.trim() || 'NC', zip_code?.trim() || '28226', id).run()

  const home = await queryOne(c.env.DB, 'SELECT * FROM homesites WHERE id = ?', [id])
  return c.json(home as any)
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

// GET /api/residents — all residents with homesite info (admin only)
app.get('/api/residents', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

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
    'INSERT INTO residents (homesite_id, name) VALUES (?, ?)'
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

  let sql = `
    SELECT h.id, h.street_number, h.street_name, h.city, h.state,
      (h.photo IS NOT NULL) AS has_photo,
      json_group_array(json_object('id', r.id, 'name', r.name)) FILTER (WHERE r.id IS NOT NULL) as residents_json,
      (SELECT MIN(r2.id) FROM residents r2 WHERE r2.homesite_id = h.id) as first_resident_id
    FROM homesites h
    LEFT JOIN residents r ON r.homesite_id = h.id
  `
  const bindings: (string | number)[] = []

  // Residents see only their own homesite. The filter must precede GROUP BY.
  if (user.role !== 'admin' && user.resident_id) {
    const res = await queryOne(c.env.DB,
      'SELECT homesite_id FROM residents WHERE id = ?', [user.resident_id])
    if (!res) return c.json([])
    sql += ' WHERE h.id = ?'
    bindings.push(Number(res.homesite_id))
  }

  sql += ' GROUP BY h.id ORDER BY CAST(h.street_number AS INTEGER), h.street_name'

  const homes = await queryAll(c.env.DB, sql, bindings)

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

  if (user.role !== 'admin' && user.resident_id !== id) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const resident = await queryOne(c.env.DB, `
    SELECT r.*, h.street_number, h.street_name
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
  const allowed = ['address_street_number', 'address_street_name', 'city', 'state']
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

  if (Array.isArray(phones)) {
    await c.env.DB.prepare('DELETE FROM phones WHERE resident_id = ?').bind(id).run()
    for (const num of phones) {
      if (num?.trim()) await c.env.DB.prepare('INSERT INTO phones (resident_id, number) VALUES (?, ?)').bind(id, num.trim()).run()
    }
  }

  if (Array.isArray(emails)) {
    await c.env.DB.prepare('DELETE FROM emails WHERE resident_id = ?').bind(id).run()
    for (const addr of emails) {
      if (addr?.trim()) await c.env.DB.prepare('INSERT INTO emails (resident_id, address) VALUES (?, ?)').bind(id, addr.trim()).run()
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
    const u = await queryOne(c.env.DB, 'SELECT password_hash FROM users WHERE id = ?', [id])
    if (!u || !bcrypt.compareSync(currentPassword, u.password_hash as string)) {
      return c.json({ error: 'Current password incorrect' }, 400)
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
    // Guard the UNIQUE(email) constraint so a clash is a 409, not a D1 500
    const clash = await queryOne(c.env.DB,
      'SELECT id FROM users WHERE email = ? AND id != ?', [email, user.id])
    if (clash) return c.json({ error: 'Email already in use' }, 409)
    await c.env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, user.id).run()
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
    SELECT u.id, u.email, u.role, u.resident_id,
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

  const result = await c.env.DB.prepare(
    'INSERT INTO users (email, password_hash, role, resident_id) VALUES (?, ?, ?, ?)'
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

export default app