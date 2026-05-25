import { test, expect, type APIRequestContext } from '@playwright/test'

// Seeded credentials (see README / d1/seed.sql).
const ADMIN = { email: 'admin@addrbook.local', password: 'ChangeThis123!' }
const RESIDENT = { email: 'resident1@addrbook.local', password: 'Resident123!' }

type Session = { id: number; email: string; role: string; resident_id: number | null; must_change_password?: number; token: string }

async function login(request: APIRequestContext, creds: { email: string; password: string }): Promise<Session> {
  const res = await request.post('/api/auth/login', { data: creds })
  expect(res.status(), `login ${creds.email}`).toBe(200)
  const body = await res.json()
  expect(body.token, 'login returns a token').toBeTruthy()
  return body
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

// The JWT carries resident_id, which /api/auth/me does not return.
function residentIdFromToken(token: string): number {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  return payload.resident_id
}

const uniqueEmail = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@addrbook.local`

test.describe('login', () => {
  test('rejects missing credentials', async ({ request }) => {
    expect((await request.post('/api/auth/login', { data: {} })).status()).toBe(400)
  })

  test('rejects a wrong password', async ({ request }) => {
    const res = await request.post('/api/auth/login', { data: { email: ADMIN.email, password: 'nope' } })
    expect(res.status()).toBe(401)
  })

  test('admin can log in', async ({ request }) => {
    const s = await login(request, ADMIN)
    expect(s.role).toBe('admin')
  })

  test('admin must change password on first login; a resident need not', async ({ request }) => {
    const admin = await login(request, ADMIN)
    expect(admin.must_change_password).toBeTruthy()
    const me = await (await request.get('/api/auth/me', { headers: auth(admin.token) })).json()
    expect(me.must_change_password).toBeTruthy()

    const resident = await login(request, RESIDENT)
    expect(resident.must_change_password).toBeFalsy()
  })
})

test.describe('login rate limiting', () => {
  test('blocks after repeated failures, scoped per email', async ({ request }) => {
    const email = uniqueEmail('ratelimit')
    const bad = { email, password: 'wrong-password' }

    // The first 5 failures (LOGIN_MAX_ATTEMPTS) return 401.
    for (let i = 0; i < 5; i++) {
      expect((await request.post('/api/auth/login', { data: bad })).status(), `attempt ${i + 1}`).toBe(401)
    }

    // The next attempt is rate-limited, with a Retry-After hint.
    const blocked = await request.post('/api/auth/login', { data: bad })
    expect(blocked.status()).toBe(429)
    expect(blocked.headers()['retry-after']).toBeTruthy()

    // A different email is unaffected — the limit is per-account.
    const other = await request.post('/api/auth/login', { data: { email: uniqueEmail('other'), password: 'wrong' } })
    expect(other.status()).toBe(401)
  })
})

test.describe('authentication required', () => {
  test('admin user list rejects anonymous', async ({ request }) => {
    expect((await request.get('/api/admin/users')).status()).toBe(401)
  })

  test('homesites rejects anonymous', async ({ request }) => {
    expect((await request.get('/api/homesites')).status()).toBe(401)
  })
})

test.describe('resident authorization', () => {
  let resident: Session
  let ownResidentId: number

  test.beforeAll(async ({ request }) => {
    resident = await login(request, RESIDENT)
    ownResidentId = residentIdFromToken(resident.token)
  })

  test('login and /api/auth/me expose resident_id', async ({ request }) => {
    // The frontend needs resident_id for self-service features (profile,
    // phone editor). It must be present and consistent with the JWT.
    expect(typeof resident.resident_id).toBe('number')
    expect(resident.resident_id).toBe(ownResidentId)
    const me = await (await request.get('/api/auth/me', { headers: auth(resident.token) })).json()
    expect(me.resident_id).toBe(ownResidentId)
  })

  test('cannot access the admin user list', async ({ request }) => {
    expect((await request.get('/api/admin/users', { headers: auth(resident.token) })).status()).toBe(403)
  })

  test('cannot create residents (admin-only)', async ({ request }) => {
    const res = await request.post('/api/residents', {
      headers: auth(resident.token),
      data: { name: 'Mallory', homesite_id: 1 },
    })
    expect(res.status()).toBe(403)
  })

  test('can read own profile but not another resident', async ({ request }) => {
    const own = await request.get(`/api/residents/${ownResidentId}`, { headers: auth(resident.token) })
    expect(own.status()).toBe(200)
    expect((await own.json()).id).toBe(ownResidentId)

    const other = await request.get(`/api/residents/${ownResidentId + 1}`, { headers: auth(resident.token) })
    expect(other.status(), 'reading another resident is forbidden').toBe(403)
  })

  test('homesites are scoped to the resident', async ({ request }) => {
    const res = await request.get('/api/homesites', { headers: auth(resident.token) })
    expect(res.status()).toBe(200)
    expect((await res.json()).length, 'resident sees only their own homesite').toBe(1)
  })
})

test.describe('admin user management', () => {
  let admin: Session

  test.beforeAll(async ({ request }) => {
    admin = await login(request, ADMIN)
  })

  test('lists users including the admin', async ({ request }) => {
    const res = await request.get('/api/admin/users', { headers: auth(admin.token) })
    expect(res.status()).toBe(200)
    const users = await res.json()
    expect(Array.isArray(users)).toBe(true)
    expect(users.some((u: any) => u.email === ADMIN.email)).toBe(true)
  })

  test('rejects a too-short password on create', async ({ request }) => {
    const res = await request.post('/api/admin/users', {
      headers: auth(admin.token),
      data: { email: uniqueEmail('short'), password: 'short', resident_id: 1 },
    })
    expect(res.status()).toBe(400)
  })

  test('cannot delete its own account', async ({ request }) => {
    const res = await request.delete(`/api/admin/users/${admin.id}`, { headers: auth(admin.token) })
    expect(res.status()).toBe(400)
  })

  test('create → duplicate → reset → login → delete lifecycle', async ({ request }) => {
    const email = uniqueEmail('smoke')

    const created = await request.post('/api/admin/users', {
      headers: auth(admin.token),
      data: { email, password: 'Smoke123!', role: 'resident', resident_id: 1 },
    })
    expect(created.status()).toBe(201)
    const id = (await created.json()).id
    expect(id).toBeTruthy()

    const dup = await request.post('/api/admin/users', {
      headers: auth(admin.token),
      data: { email, password: 'Smoke123!', resident_id: 1 },
    })
    expect(dup.status(), 'duplicate email is rejected').toBe(409)

    const reset = await request.post(`/api/admin/users/${id}/reset-password`, {
      headers: auth(admin.token),
      data: { newPassword: 'Reset123!' },
    })
    expect(reset.status()).toBe(200)

    // The reset must actually take effect.
    expect((await request.post('/api/auth/login', { data: { email, password: 'Reset123!' } })).status()).toBe(200)

    expect((await request.delete(`/api/admin/users/${id}`, { headers: auth(admin.token) })).status()).toBe(200)

    // After deletion, login fails.
    expect((await request.post('/api/auth/login', { data: { email, password: 'Reset123!' } })).status()).toBe(401)
  })
})

test.describe('profile self-service', () => {
  let admin: Session
  let userId: number
  let session: Session
  const originalEmail = uniqueEmail('profile')
  const originalPassword = 'Profile123!'
  // /api/auth/me reflects the JWT payload, not live DB state, so track the
  // current email ourselves as we change it.
  let currentEmail = originalEmail

  test.beforeAll(async ({ request }) => {
    admin = await login(request, ADMIN)
    const created = await request.post('/api/admin/users', {
      headers: auth(admin.token),
      data: { email: originalEmail, password: originalPassword, resident_id: 1 },
    })
    expect(created.status()).toBe(201)
    userId = (await created.json()).id
    session = await login(request, { email: originalEmail, password: originalPassword })
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/admin/users/${userId}`, { headers: auth(admin.token) })
  })

  test('can change own email', async ({ request }) => {
    const next = uniqueEmail('profile-new')
    const res = await request.put('/api/auth/profile', { headers: auth(session.token), data: { email: next } })
    expect(res.status()).toBe(200)
    expect((await res.json()).user.email).toBe(next)
    currentEmail = next
  })

  test('rejects changing email to one already in use', async ({ request }) => {
    const res = await request.put('/api/auth/profile', { headers: auth(session.token), data: { email: ADMIN.email } })
    expect(res.status()).toBe(409)
  })

  test('can change own password with the current one', async ({ request }) => {
    const res = await request.put('/api/auth/profile', {
      headers: auth(session.token),
      data: { password: 'Changed123!', currentPassword: originalPassword },
    })
    expect(res.status()).toBe(200)
    expect((await request.post('/api/auth/login', { data: { email: currentEmail, password: 'Changed123!' } })).status()).toBe(200)
  })

  test('rejects a password change with the wrong current password', async ({ request }) => {
    const res = await request.put('/api/auth/profile', {
      headers: auth(session.token),
      data: { password: 'Whatever123!', currentPassword: 'definitely-wrong' },
    })
    expect(res.status()).toBe(400)
  })
})

test.describe('resident contacts', () => {
  let admin: Session
  let resident: Session
  let tempResidentId: number

  test.beforeAll(async ({ request }) => {
    admin = await login(request, ADMIN)
    resident = await login(request, RESIDENT)
    const created = await request.post('/api/residents', {
      headers: auth(admin.token),
      data: { name: 'Temp Contact', homesite_id: 1 },
    })
    expect(created.status()).toBe(201)
    tempResidentId = (await created.json()).id
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/residents/${tempResidentId}`, { headers: auth(admin.token) })
  })

  test('admin can replace contacts', async ({ request }) => {
    const res = await request.put(`/api/residents/${tempResidentId}/contacts`, {
      headers: auth(admin.token),
      data: { phones: ['(704) 555-0001'], emails: ['temp@example.com'] },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.phones.length).toBe(1)
    expect(body.emails.length).toBe(1)
  })

  test('a non-owner resident cannot edit them', async ({ request }) => {
    const res = await request.put(`/api/residents/${tempResidentId}/contacts`, {
      headers: auth(resident.token),
      data: { phones: ['(704) 555-9999'] },
    })
    expect(res.status()).toBe(403)
  })

  // The path the Settings phone editor uses: a resident updates their own
  // contacts. Capture and restore so the seed is left unchanged.
  test('a resident can edit their own contacts', async ({ request }) => {
    const ownId = residentIdFromToken(resident.token)
    const before = await (await request.get(`/api/residents/${ownId}`, { headers: auth(resident.token) })).json()
    const original: string[] = before.phones.map((p: any) => p.number)

    const updated = await request.put(`/api/residents/${ownId}/contacts`, {
      headers: auth(resident.token),
      data: { phones: ['(704) 555-0123'] },
    })
    expect(updated.status()).toBe(200)
    expect((await updated.json()).phones.map((p: any) => p.number)).toEqual(['(704) 555-0123'])

    const restore = await request.put(`/api/residents/${ownId}/contacts`, {
      headers: auth(resident.token),
      data: { phones: original },
    })
    expect(restore.status()).toBe(200)
  })
})

test.describe('homesite photo', () => {
  let admin: Session
  let homesiteId: number

  test.beforeAll(async ({ request }) => {
    admin = await login(request, ADMIN)
    const created = await request.post('/api/homesites', {
      headers: auth(admin.token),
      data: { street_number: '1', street_name: 'Smoke Test Ln', city: 'Charlotte', state: 'NC', zip_code: '28226' },
    })
    expect(created.status()).toBe(201)
    homesiteId = (await created.json()).id
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/homesites/${homesiteId}`, { headers: auth(admin.token) })
  })

  test('rejects a photo over the 200 KB cap', async ({ request }) => {
    const tooBig = Buffer.alloc(200 * 1024 + 1)
    const res = await request.put(`/api/homesites/${homesiteId}/photo`, {
      headers: { ...auth(admin.token), 'Content-Type': 'image/jpeg' },
      data: tooBig,
    })
    expect(res.status()).toBe(400)
  })

  test('accepts, serves, and removes a photo', async ({ request }) => {
    const small = Buffer.from('not-a-real-jpeg-but-small')
    const put = await request.put(`/api/homesites/${homesiteId}/photo`, {
      headers: { ...auth(admin.token), 'Content-Type': 'image/jpeg' },
      data: small,
    })
    expect(put.status()).toBe(200)

    const get = await request.get(`/api/homesites/${homesiteId}/photo`, { headers: auth(admin.token) })
    expect(get.status()).toBe(200)
    expect(get.headers()['content-type']).toContain('image/jpeg')

    expect((await request.delete(`/api/homesites/${homesiteId}/photo`, { headers: auth(admin.token) })).status()).toBe(200)

    // Removed → no photo.
    expect((await request.get(`/api/homesites/${homesiteId}/photo`, { headers: auth(admin.token) })).status()).toBe(404)
  })

  test('the homesites list reports has_photo', async ({ request }) => {
    const findHasPhoto = async () => {
      const list = await (await request.get('/api/homesites', { headers: auth(admin.token) })).json()
      return list.find((h: any) => h.id === homesiteId)?.has_photo
    }

    expect(await findHasPhoto()).toBeFalsy()
    await request.put(`/api/homesites/${homesiteId}/photo`, {
      headers: { ...auth(admin.token), 'Content-Type': 'image/jpeg' },
      data: Buffer.from('not-a-real-jpeg'),
    })
    expect(await findHasPhoto()).toBeTruthy()
    await request.delete(`/api/homesites/${homesiteId}/photo`, { headers: auth(admin.token) })
    expect(await findHasPhoto()).toBeFalsy()
  })
})
