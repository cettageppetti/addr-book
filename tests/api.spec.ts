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

  test('setup-state is public and returns a boolean', async ({ request }) => {
    const res = await request.get('/api/auth/setup-state')
    expect(res.status()).toBe(200)
    expect(typeof (await res.json()).needs_setup).toBe('boolean')
  })

  test('an admin-created account is on a temp password and must change it on first login', async ({ request }) => {
    // This is the mechanism that flags every non-admin account: admin-created
    // users (and seeded residents, which seed.sql inserts the same way) start
    // on a password they did not choose. We provision our own user rather than
    // assert against a seeded row, whose flag a browser session can have cleared.
    const admin = await login(request, ADMIN)

    const r = await request.post('/api/residents', { headers: auth(admin.token), data: { name: 'MustChange Temp', homesite_id: 1 } })
    const residentId = (await r.json()).id
    const email = uniqueEmail('mustchange')
    const created = await request.post('/api/admin/users', {
      headers: auth(admin.token),
      data: { email, password: 'Temp12345!', resident_id: residentId },
    })
    expect(created.status()).toBe(201)
    const userId = (await created.json()).id

    // First login is flagged to force a password change; /me agrees.
    const session = await login(request, { email, password: 'Temp12345!' })
    expect(session.must_change_password).toBeTruthy()
    const me = await (await request.get('/api/auth/me', { headers: auth(session.token) })).json()
    expect(me.must_change_password).toBeTruthy()

    await request.delete(`/api/admin/users/${userId}`, { headers: auth(admin.token) })
    await request.delete(`/api/residents/${residentId}`, { headers: auth(admin.token) })
  })

  test('a forced-change user sets a new password without supplying the old one', async ({ request }) => {
    const admin = await login(request, ADMIN)
    const r = await request.post('/api/residents', { headers: auth(admin.token), data: { name: 'Forced Temp', homesite_id: 1 } })
    const residentId = (await r.json()).id
    const email = uniqueEmail('forced')
    const created = await request.post('/api/admin/users', {
      headers: auth(admin.token),
      data: { email, password: 'Temp12345!', resident_id: residentId },
    })
    const userId = (await created.json()).id

    // As the change-password gate does: send only newPassword, no currentPassword.
    const session = await login(request, { email, password: 'Temp12345!' })
    expect(session.must_change_password).toBeTruthy()
    const res = await request.put(`/api/users/${userId}/password`, {
      headers: auth(session.token),
      data: { newPassword: 'BrandNew123!' },
    })
    expect(res.status()).toBe(200)

    // Flag cleared, new password works, old one no longer does.
    expect((await login(request, { email, password: 'BrandNew123!' })).must_change_password).toBeFalsy()
    expect((await request.post('/api/auth/login', { data: { email, password: 'Temp12345!' } })).status()).toBe(401)

    await request.delete(`/api/admin/users/${userId}`, { headers: auth(admin.token) })
    await request.delete(`/api/residents/${residentId}`, { headers: auth(admin.token) })
  })

  test('a normal (non-flagged) self password change still requires the current password', async ({ request }) => {
    const admin = await login(request, ADMIN)
    const r = await request.post('/api/residents', { headers: auth(admin.token), data: { name: 'NoCurrent Temp', homesite_id: 1 } })
    const residentId = (await r.json()).id
    const email = uniqueEmail('nocurrent')
    const created = await request.post('/api/admin/users', {
      headers: auth(admin.token),
      data: { email, password: 'Temp12345!', resident_id: residentId },
    })
    const userId = (await created.json()).id

    // Clear the forced-change flag first.
    const session = await login(request, { email, password: 'Temp12345!' })
    await request.put(`/api/users/${userId}/password`, { headers: auth(session.token), data: { newPassword: 'BrandNew123!' } })

    // Now a self change without the current password is rejected.
    const settled = await login(request, { email, password: 'BrandNew123!' })
    expect((await request.put(`/api/users/${userId}/password`, {
      headers: auth(settled.token),
      data: { newPassword: 'Another123!' },
    })).status()).toBe(400)

    await request.delete(`/api/admin/users/${userId}`, { headers: auth(admin.token) })
    await request.delete(`/api/residents/${residentId}`, { headers: auth(admin.token) })
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

  test('can list all residents (directory)', async ({ request }) => {
    const res = await request.get('/api/residents', { headers: auth(resident.token) })
    expect(res.status()).toBe(200)
    expect((await res.json()).length, 'resident sees the whole directory').toBeGreaterThan(1)
  })

  test('can read any resident profile, own and a neighbor', async ({ request }) => {
    const own = await request.get(`/api/residents/${ownResidentId}`, { headers: auth(resident.token) })
    expect(own.status()).toBe(200)
    expect((await own.json()).id).toBe(ownResidentId)

    const other = await request.get(`/api/residents/${ownResidentId + 1}`, { headers: auth(resident.token) })
    expect(other.status(), 'a resident can view a neighbor').toBe(200)
    const body = await other.json()
    expect(Array.isArray(body.phones)).toBe(true)
    expect(Array.isArray(body.emails)).toBe(true)
  })

  test('sees all homesites (full directory)', async ({ request }) => {
    const res = await request.get('/api/homesites', { headers: auth(resident.token) })
    expect(res.status()).toBe(200)
    expect((await res.json()).length, 'resident sees the whole neighborhood').toBeGreaterThan(1)
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
    // A fresh resident, since each resident can have only one account.
    const r = await request.post('/api/residents', { headers: auth(admin.token), data: { name: 'Lifecycle Temp', homesite_id: 1 } })
    const rid = (await r.json()).id
    const email = uniqueEmail('smoke')

    const created = await request.post('/api/admin/users', {
      headers: auth(admin.token),
      data: { email, password: 'Smoke1234!', role: 'resident', resident_id: rid },
    })
    expect(created.status()).toBe(201)
    const id = (await created.json()).id
    expect(id).toBeTruthy()

    const dup = await request.post('/api/admin/users', {
      headers: auth(admin.token),
      data: { email, password: 'Smoke1234!', resident_id: rid },
    })
    expect(dup.status(), 'duplicate email is rejected').toBe(409)

    const reset = await request.post(`/api/admin/users/${id}/reset-password`, {
      headers: auth(admin.token),
      data: { newPassword: 'Reset1234!' },
    })
    expect(reset.status()).toBe(200)

    // The reset must actually take effect.
    expect((await request.post('/api/auth/login', { data: { email, password: 'Reset1234!' } })).status()).toBe(200)

    expect((await request.delete(`/api/admin/users/${id}`, { headers: auth(admin.token) })).status()).toBe(200)

    // After deletion, login fails.
    expect((await request.post('/api/auth/login', { data: { email, password: 'Reset1234!' } })).status()).toBe(401)

    await request.delete(`/api/residents/${rid}`, { headers: auth(admin.token) })
  })
})

test.describe('resident/account integrity', () => {
  let admin: Session

  test.beforeAll(async ({ request }) => {
    admin = await login(request, ADMIN)
  })

  test('deleting a resident unlinks its login account (no dangling reference)', async ({ request }) => {
    const created = await request.post('/api/residents', {
      headers: auth(admin.token),
      data: { name: 'Integrity Temp', homesite_id: 1 },
    })
    expect(created.status()).toBe(201)
    const residentId = (await created.json()).id

    const email = uniqueEmail('integrity')
    const u = await request.post('/api/admin/users', {
      headers: auth(admin.token),
      data: { email, password: 'Integrity123!', resident_id: residentId },
    })
    expect(u.status()).toBe(201)
    const userId = (await u.json()).id

    // The account is linked to the resident.
    expect((await login(request, { email, password: 'Integrity123!' })).resident_id).toBe(residentId)

    // Deleting the resident must unlink the account, not leave it dangling.
    expect((await request.delete(`/api/residents/${residentId}`, { headers: auth(admin.token) })).status()).toBe(200)
    expect((await login(request, { email, password: 'Integrity123!' })).resident_id).toBeNull()

    await request.delete(`/api/admin/users/${userId}`, { headers: auth(admin.token) })
  })

  test('a resident can have at most one account', async ({ request }) => {
    const created = await request.post('/api/residents', {
      headers: auth(admin.token),
      data: { name: 'Integrity Temp 2', homesite_id: 1 },
    })
    const residentId = (await created.json()).id

    const first = await request.post('/api/admin/users', {
      headers: auth(admin.token),
      data: { email: uniqueEmail('uniq'), password: 'Integrity123!', resident_id: residentId },
    })
    expect(first.status()).toBe(201)
    const userId = (await first.json()).id

    const second = await request.post('/api/admin/users', {
      headers: auth(admin.token),
      data: { email: uniqueEmail('uniq'), password: 'Integrity123!', resident_id: residentId },
    })
    expect(second.status(), 'second account for the same resident is rejected').toBe(409)

    await request.delete(`/api/admin/users/${userId}`, { headers: auth(admin.token) })
    await request.delete(`/api/residents/${residentId}`, { headers: auth(admin.token) })
  })
})

test.describe('neighborhood default settings', () => {
  let admin: Session
  let resident: Session

  test.beforeAll(async ({ request }) => {
    admin = await login(request, ADMIN)
    resident = await login(request, RESIDENT)
  })

  test('residents cannot read settings', async ({ request }) => {
    expect((await request.get('/api/settings', { headers: auth(resident.token) })).status()).toBe(403)
  })

  test('admin updates defaults; new homesites inherit them', async ({ request }) => {
    const original = await (await request.get('/api/settings', { headers: auth(admin.token) })).json()

    const upd = await request.put('/api/settings', {
      headers: auth(admin.token),
      data: { default_city: 'Testville', default_state: 'TX', default_zip_code: '75001' },
    })
    expect(upd.status()).toBe(200)
    expect((await upd.json()).default_city).toBe('Testville')

    // A homesite created without city/state/zip inherits the configured defaults.
    const created = await request.post('/api/homesites', {
      headers: auth(admin.token),
      data: { street_number: '1', street_name: 'Default Way' },
    })
    expect(created.status()).toBe(201)
    const home = await created.json()
    expect(home.city).toBe('Testville')
    expect(home.state).toBe('TX')
    expect(home.zip_code).toBe('75001')

    // Clean up and restore the original defaults.
    await request.delete(`/api/homesites/${home.id}`, { headers: auth(admin.token) })
    await request.put('/api/settings', { headers: auth(admin.token), data: original })
  })

  test('site_name is admin-configurable and publicly readable', async ({ request }) => {
    const original = await (await request.get('/api/settings', { headers: auth(admin.token) })).json()

    // The header reads the name from a public endpoint (no auth required).
    const pub = await request.get('/api/site-info')
    expect(pub.status()).toBe(200)
    expect(typeof (await pub.json()).site_name).toBe('string')

    // Admin sets name + theme; PUT echoes them back and the public endpoint reflects them.
    const upd = await request.put('/api/settings', { headers: auth(admin.token), data: { site_name: 'Maple Grove', site_theme: 'civic' } })
    expect(upd.status()).toBe(200)
    expect((await upd.json()).site_name).toBe('Maple Grove')
    const pubAfter = await (await request.get('/api/site-info')).json()
    expect(pubAfter.site_name).toBe('Maple Grove')
    expect(pubAfter.site_theme).toBe('civic')

    // The PWA manifest (public, served by the Worker) reflects name + theme.
    const man = await request.get('/api/manifest.webmanifest')
    expect(man.status()).toBe(200)
    expect(man.headers()['content-type']).toContain('manifest')
    const mj = await man.json()
    expect(mj.name).toBe('Maple Grove')
    expect(mj.short_name).toBe('Maple Grove')
    expect(mj.theme_color).toBe('#2563eb') // civic blue

    await request.put('/api/settings', { headers: auth(admin.token), data: original })
  })
})

test.describe('add home with residents', () => {
  let admin: Session
  test.beforeAll(async ({ request }) => { admin = await login(request, ADMIN) })

  test('creating a homesite can create its residents in one call (comma-separated)', async ({ request }) => {
    const created = await request.post('/api/homesites', {
      headers: auth(admin.token),
      // One comma-separated entry splits into two; blanks are ignored.
      data: { street_number: '42', street_name: 'Galaxy Way', residents: ['Bob Engle, Jane Engle', '   ', 'Sam Smith'] },
    })
    expect(created.status()).toBe(201)
    const homesiteId = (await created.json()).id

    const list = await (await request.get('/api/homesites', { headers: auth(admin.token) })).json()
    const home = list.find((h: any) => h.id === homesiteId)
    const names = (home.residents || []).map((r: any) => r.name).sort()
    expect(names).toEqual(['Bob Engle', 'Jane Engle', 'Sam Smith'])

    // Cascade-deletes the residents too.
    await request.delete(`/api/homesites/${homesiteId}`, { headers: auth(admin.token) })
  })
})

test.describe('user roles', () => {
  let admin: Session
  test.beforeAll(async ({ request }) => { admin = await login(request, ADMIN) })

  const roleOf = async (request: any, token: string, id: number) => {
    const list = await (await request.get('/api/admin/users', { headers: auth(token) })).json()
    return list.find((u: any) => u.id === id)?.role
  }

  test('admin can promote a user only after it sets its own password, then demote freely', async ({ request }) => {
    const r = await request.post('/api/residents', { headers: auth(admin.token), data: { name: 'Role Temp', homesite_id: 1 } })
    const rid = (await r.json()).id
    const email = uniqueEmail('role')
    const u = await request.post('/api/admin/users', {
      headers: auth(admin.token),
      data: { email, password: 'Role12345!', resident_id: rid },
    })
    const uid = (await u.json()).id

    // Still on the admin-set temp password → promotion is blocked.
    expect((await request.put(`/api/admin/users/${uid}/role`, { headers: auth(admin.token), data: { role: 'admin' } })).status()).toBe(400)
    expect(await roleOf(request, admin.token, uid)).toBe('resident')

    // User sets its own password, clearing the forced-change flag.
    const userSession = await login(request, { email, password: 'Role12345!' })
    expect((await request.put(`/api/users/${uid}/password`, {
      headers: auth(userSession.token),
      data: { currentPassword: 'Role12345!', newPassword: 'NewRole123!' },
    })).status()).toBe(200)

    // Now promotion is allowed.
    expect((await request.put(`/api/admin/users/${uid}/role`, { headers: auth(admin.token), data: { role: 'admin' } })).status()).toBe(200)
    expect(await roleOf(request, admin.token, uid)).toBe('admin')

    // Demotion is unrestricted regardless of password state.
    expect((await request.put(`/api/admin/users/${uid}/role`, { headers: auth(admin.token), data: { role: 'resident' } })).status()).toBe(200)
    expect(await roleOf(request, admin.token, uid)).toBe('resident')

    await request.delete(`/api/admin/users/${uid}`, { headers: auth(admin.token) })
    await request.delete(`/api/residents/${rid}`, { headers: auth(admin.token) })
  })

  test('an admin cannot change their own role, and residents cannot change roles', async ({ request }) => {
    expect((await request.put(`/api/admin/users/${admin.id}/role`, { headers: auth(admin.token), data: { role: 'resident' } })).status()).toBe(400)
    const resident = await login(request, RESIDENT)
    expect((await request.put(`/api/admin/users/${admin.id}/role`, { headers: auth(resident.token), data: { role: 'admin' } })).status()).toBe(403)
  })
})

test.describe('profile self-service', () => {
  let admin: Session
  let userId: number
  let residentId: number
  let session: Session
  const originalEmail = uniqueEmail('profile')
  const originalPassword = 'Profile123!'
  // /api/auth/me reflects the JWT payload, not live DB state, so track the
  // current email ourselves as we change it.
  let currentEmail = originalEmail

  test.beforeAll(async ({ request }) => {
    admin = await login(request, ADMIN)
    const r = await request.post('/api/residents', { headers: auth(admin.token), data: { name: 'Profile Temp', homesite_id: 1 } })
    residentId = (await r.json()).id
    const created = await request.post('/api/admin/users', {
      headers: auth(admin.token),
      data: { email: originalEmail, password: originalPassword, resident_id: residentId },
    })
    expect(created.status()).toBe(201)
    userId = (await created.json()).id
    session = await login(request, { email: originalEmail, password: originalPassword })
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/admin/users/${userId}`, { headers: auth(admin.token) })
    await request.delete(`/api/residents/${residentId}`, { headers: auth(admin.token) })
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

  test('rejects an invalid email format', async ({ request }) => {
    const res = await request.put('/api/auth/profile', {
      headers: auth(session.token),
      data: { email: 'not-an-email' },
    })
    expect(res.status()).toBe(400)
  })

  test('changing email re-issues the session cookie with the new email', async ({ request }) => {
    const next = uniqueEmail('reissue')
    const res = await request.put('/api/auth/profile', { headers: auth(session.token), data: { email: next } })
    expect(res.status()).toBe(200)
    // The response must set a fresh token cookie whose JWT carries the new email.
    const setCookie = res.headers()['set-cookie'] || ''
    const token = setCookie.match(/token=([^;]+)/)?.[1] ?? ''
    expect(token, 'a new token cookie is set').toBeTruthy()
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    expect(payload.email).toBe(next)
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

  test('rejects an invalid email in contacts', async ({ request }) => {
    const res = await request.put(`/api/residents/${tempResidentId}/contacts`, {
      headers: auth(admin.token),
      data: { emails: ['not-an-email'] },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects an implausible phone in contacts', async ({ request }) => {
    const res = await request.put(`/api/residents/${tempResidentId}/contacts`, {
      headers: auth(admin.token),
      data: { phones: ['12345'] },
    })
    expect(res.status()).toBe(400)
  })

  test('a mailing address (incl. zip) saves and is returned with the homesite address', async ({ request }) => {
    const patched = await request.patch(`/api/residents/${tempResidentId}/address`, {
      headers: auth(admin.token),
      data: {
        address_street_number: '99', address_street_name: 'Elsewhere Ave',
        address_city: 'Raleigh', address_state: 'NC', address_zip_code: '27601',
      },
    })
    expect(patched.status()).toBe(200)

    const got = await (await request.get(`/api/residents/${tempResidentId}`, { headers: auth(admin.token) })).json()
    // The previously-dropped zip is now persisted.
    expect(got.address_zip_code).toBe('27601')
    expect(got.address_city).toBe('Raleigh')
    // The homesite address is still returned (show-both), with its real zip.
    expect(got.homesite_zip_code).toBeTruthy()
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
    // Use raw bytes (including a non-ASCII byte) so a corrupted round-trip is
    // detectable — D1 returns BLOBs as number[], which must be re-encoded.
    const small = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x10, 0x42, 0x4d])
    const put = await request.put(`/api/homesites/${homesiteId}/photo`, {
      headers: { ...auth(admin.token), 'Content-Type': 'image/jpeg' },
      data: small,
    })
    expect(put.status()).toBe(200)

    const get = await request.get(`/api/homesites/${homesiteId}/photo`, { headers: auth(admin.token) })
    expect(get.status()).toBe(200)
    expect(get.headers()['content-type']).toContain('image/jpeg')
    // The served body must be the exact bytes that were uploaded.
    expect(Buffer.from(await get.body()).equals(small)).toBe(true)

    expect((await request.delete(`/api/homesites/${homesiteId}/photo`, { headers: auth(admin.token) })).status()).toBe(200)

    // Removed → no photo.
    expect((await request.get(`/api/homesites/${homesiteId}/photo`, { headers: auth(admin.token) })).status()).toBe(404)
  })

  test('the homesites list returns zip_code', async ({ request }) => {
    const list = await (await request.get('/api/homesites', { headers: auth(admin.token) })).json()
    expect(list.find((h: any) => h.id === homesiteId)?.zip_code).toBe('28226')
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

test.describe('homesites listing order', () => {
  test('ordered alphabetically by street name, then numerically by street number', async ({ request }) => {
    const admin = await login(request, ADMIN)
    const tag = `Zzz Order ${Date.now()}`
    const ids: number[] = []
    // Insert deliberately out of order, with a two-digit number that would sort
    // before a one-digit one lexically (so the numeric cast is exercised).
    for (const [num, suffix] of [['20', 'Ave'], ['3', 'Ave'], ['5', 'Blvd']] as const) {
      const res = await request.post('/api/homesites', {
        headers: auth(admin.token),
        data: { street_number: num, street_name: `${tag} ${suffix}` },
      })
      ids.push((await res.json()).id)
    }

    const list = await (await request.get('/api/homesites', { headers: auth(admin.token) })).json()
    const ours = list
      .filter((h: any) => h.street_name?.startsWith(tag))
      .map((h: any) => `${h.street_number} ${h.street_name}`)
    expect(ours).toEqual([`3 ${tag} Ave`, `20 ${tag} Ave`, `5 ${tag} Blvd`])

    for (const id of ids) await request.delete(`/api/homesites/${id}`, { headers: auth(admin.token) })
  })
})

test.describe('auth hardening', () => {
  let admin: Session
  test.beforeAll(async ({ request }) => { admin = await login(request, ADMIN) })

  test('rejects weak passwords (too short or common)', async ({ request }) => {
    const r = await request.post('/api/residents', { headers: auth(admin.token), data: { name: 'PwPolicy Temp', homesite_id: 1 } })
    const rid = (await r.json()).id

    // < 10 chars → rejected
    const short = await request.post('/api/admin/users', { headers: auth(admin.token), data: { email: uniqueEmail('pw'), password: 'Short12!', resident_id: rid } })
    expect(short.status()).toBe(400)
    // common/blocklisted → rejected
    const common = await request.post('/api/admin/users', { headers: auth(admin.token), data: { email: uniqueEmail('pw'), password: 'password123', resident_id: rid } })
    expect(common.status()).toBe(400)
    // acceptable → created
    const ok = await request.post('/api/admin/users', { headers: auth(admin.token), data: { email: uniqueEmail('pw'), password: 'GoodPass123!', resident_id: rid } })
    expect(ok.status()).toBe(201)
    const uid = (await ok.json()).id

    await request.delete(`/api/admin/users/${uid}`, { headers: auth(admin.token) })
    await request.delete(`/api/residents/${rid}`, { headers: auth(admin.token) })
  })

  test("a deleted account's existing token stops working immediately", async ({ request }) => {
    const r = await request.post('/api/residents', { headers: auth(admin.token), data: { name: 'Revoke Temp', homesite_id: 1 } })
    const rid = (await r.json()).id
    const email = uniqueEmail('revoke')
    const created = await request.post('/api/admin/users', { headers: auth(admin.token), data: { email, password: 'GoodPass123!', resident_id: rid } })
    const uid = (await created.json()).id

    const session = await login(request, { email, password: 'GoodPass123!' })
    expect((await request.get('/api/auth/me', { headers: auth(session.token) })).status()).toBe(200)

    // Deleting the account invalidates its still-held token (auth re-checks the DB).
    await request.delete(`/api/admin/users/${uid}`, { headers: auth(admin.token) })
    expect((await request.get('/api/auth/me', { headers: auth(session.token) })).status()).toBe(401)

    await request.delete(`/api/residents/${rid}`, { headers: auth(admin.token) })
  })
})
