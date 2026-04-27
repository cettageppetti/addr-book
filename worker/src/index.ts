import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import * as jose from 'jose'
import bcrypt from 'bcryptjs'

type Env = {
  DB: D1Database
  JWT_SECRET: string
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({
  origin: (origin) => origin,
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

// POST /api/auth/login
app.post('/api/auth/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

  const user = await queryOne(c.env.DB,
    'SELECT * FROM users WHERE email = ?', [email])

  if (!user || !bcrypt.compareSync(password, user.password_hash as string)) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const token = await signToken(
    { id: user.id, email: user.email, role: user.role, resident_id: user.resident_id },
    c.env.JWT_SECRET
  )

  setCookie(c, 'token', token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
  })

  return c.json({ id: user.id, email: user.email, role: user.role, token })
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
  return c.json({ id: user.id, email: user.email, role: user.role })
})

// GET /api/homesites
app.get('/api/homesites', async (c) => {
  const user = await getUserFromCookie(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  let sql = `
    SELECT h.*,
      (SELECT GROUP_CONCAT(r.name, ', ') FROM residents r WHERE r.homesite_id = h.id) as resident_names,
      (SELECT MIN(r.id) FROM residents r WHERE r.homesite_id = h.id) as first_resident_id
    FROM homesites h
  `

  if (user.role !== 'admin' && user.resident_id) {
    const res = await queryOne(c.env.DB,
      'SELECT homesite_id FROM residents WHERE id = ?', [user.resident_id])
    if (!res) return c.json([])
    sql += ` WHERE h.id = CAST(${res.homesite_id} AS INTEGER)`
  }

  sql += ' ORDER BY CAST(h.street_number AS INTEGER), h.street_name'

  const homes = await queryAll(c.env.DB, sql)
  return c.json((homes.results || []) as any[])
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

  if (user.role !== 'admin') {
    const u = await queryOne(c.env.DB, 'SELECT password_hash FROM users WHERE id = ?', [id])
    if (!u || !bcrypt.compareSync(currentPassword, u.password_hash as string)) {
      return c.json({ error: 'Current password incorrect' }, 400)
    }
  }

  const hash = bcrypt.hashSync(newPassword, 10)
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, id).run()
  return c.json({ ok: true })
})

export default app