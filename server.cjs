const initSqlJs = require('sql.js')
const express = require('express')
const cookieParser = require('cookie-parser')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const path = require('path')

const JWT_SECRET = process.env.JWT_SECRET || 'addr-book-dev-secret-2024'
const JWT_EXPIRY = '24h'
const DB_PATH = path.join(__dirname, 'addr-book.db')

let db

async function initDatabase() {
  const SQL = await initSqlJs()

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH)
    db = new SQL.Database(buf)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('resident', 'admin')) DEFAULT 'resident',
      resident_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS homesites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      street_number TEXT NOT NULL,
      street_name TEXT NOT NULL,
      zip_code TEXT DEFAULT '28226',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS residents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      homesite_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (homesite_id) REFERENCES homesites(id)
    );

    CREATE TABLE IF NOT EXISTS phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resident_id INTEGER NOT NULL,
      number TEXT NOT NULL,
      FOREIGN KEY (resident_id) REFERENCES residents(id)
    );

    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resident_id INTEGER NOT NULL,
      address TEXT NOT NULL,
      FOREIGN KEY (resident_id) REFERENCES residents(id)
    );
  `)

  function save() {
    const data = db.export()
    fs.writeFileSync(DB_PATH, Buffer.from(data))
  }

  function seed() {
    const count = db.exec('SELECT COUNT(*) as c FROM homesites')[0]?.values[0][0] || 0
    if (count >= 120) {
      console.log(`DB has ${count} homesites, skipping seed`)
      return
    }

    const streets = [
      'Oak Street', 'Maple Avenue', 'Pine Road', 'Cedar Lane', 'Elm Drive',
      'Walnut Circle', 'Birch Court', 'Spruce Way', 'Ash Boulevard', 'Hickory Place',
      'Poplar Street', 'Willow Avenue', 'Sycamore Road', 'Chestnut Lane', 'Magnolia Drive',
      'Redwood Circle', 'Sequoia Court', 'Juniper Way', 'Cypress Boulevard', 'Palm Place',
      'Briar Ridge', 'Holloway Vale', 'Meadowbrook Lane', 'Riverstone Drive', 'Sunset Hills',
      'Cobblestone Path', 'Winding Way', 'Hidden Valley', 'Mountain View Road', 'Clearwater Creek',
      'Lakeside Drive', 'Pinehurst Court', 'Valley View Lane', 'Hilltop Road', 'Briarcliff Place',
      'Cherry Blossom Way', 'Wildflower Path', 'Sunrise Trail', 'Evening Star Road', 'Morning Glory Circle',
      'Autumn Leaf Drive', 'Winter Pine Lane', 'Spring Bloom Court', 'Summer Sun Way', 'Golden Oak Street',
      'Silver Maple Avenue', 'Bronze Pine Road', 'Titanium Court', 'Platinum Place', 'Diamond Drive',
      'Ruby Lane', 'Sapphire Circle', 'Emerald Boulevard', 'Amethyst Way', 'Topaz Place',
      'Jade Court', 'Onyx Drive', 'Pearl Lane', 'Coral Path', 'Lapis Circle',
      'Moonstone Road', 'Sunstone Drive', 'Azurite Lane', 'Turquoise Way', 'Malachite Place'
    ]

    const firstNames = [
      'John', 'Mary', 'James', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
      'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
      'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy', 'Daniel', 'Lisa',
      'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
      'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle'
    ]

    const lastNames = [
      'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
      'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
      'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
      'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
      'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores'
    ]

    const areaCodes = ['704', '980', '723']
    const prefixes = ['555', '123', '456', '789', '321']

    for (let i = 0; i < 120; i++) {
      const streetNum = Math.floor(Math.random() * 9000) + 100
      db.run('INSERT INTO homesites (street_number, street_name) VALUES (?, ?)', [
        streetNum.toString(), streets[i % streets.length]
      ])
    }

    const homes = db.exec('SELECT id FROM homesites')
    const homeIds = homes[0]?.values.map(r => r[0]) || []

    for (let i = 0; i < homeIds.length; i++) {
      const firstName = firstNames[i % firstNames.length]
      const lastName = lastNames[i % lastNames.length]

      db.run('INSERT INTO residents (homesite_id, name) VALUES (?, ?)', [
        homeIds[i], `${firstName} ${lastName}`
      ])
      const resResult = db.exec('SELECT last_insert_rowid()')
      const residentId = resResult[0]?.values[0][0]

      const numPhones = (i % 3) + 1
      for (let p = 0; p < numPhones; p++) {
        const areaCode = areaCodes[p % areaCodes.length]
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
        const suffix = Math.floor(Math.random() * 9000) + 1000
        db.run('INSERT INTO phones (resident_id, number) VALUES (?, ?)', [
          residentId, `(${areaCode}) ${prefix}-${suffix}`
        ])
      }

      const numEmails = (i % 2) + 1
      for (let e = 0; e < numEmails; e++) {
        const domain = e === 0 ? 'gmail.com' : (e === 1 ? 'yahoo.com' : 'outlook.com')
        const suffix = e > 0 ? e.toString() : ''
        db.run('INSERT INTO emails (resident_id, address) VALUES (?, ?)', [
          residentId, `${firstName.toLowerCase()}.${lastName.toLowerCase()}${suffix}@${domain}`
        ])
      }

      db.run(
        'INSERT INTO users (email, password_hash, role, resident_id) VALUES (?, ?, ?, ?)',
        [`resident${i + 1}@addrbook.local`, bcrypt.hashSync('Resident123!', 10), 'resident', residentId]
      )
    }

    try {
      db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [
        'admin@addrbook.local', bcrypt.hashSync('ChangeThis123!', 10), 'admin'
      ])
    } catch (e) { /* already exists */ }

    save()
  }

  seed()

  return { db, save }
}

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.cookies.token
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Helper to run query and return results as array of objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql)
  if (params.length) stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params)
  return rows[0] || null
}

// --- Routes ---

const app = express()
app.use(express.json())
app.use(cookieParser())

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

  const user = queryOne('SELECT * FROM users WHERE email = ?', [email])
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, resident_id: user.resident_id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  )

  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' })
  res.json({ id: user.id, email: user.email, role: user.role })
})

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token')
  res.json({ ok: true })
})

// Get current user
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const { id, email, role } = req.user
  res.json({ id, email, role })
})

// Get all homesites (admin)
app.get('/api/homesites', authMiddleware, (req, res) => {
  const homes = queryAll(`
    SELECT h.*,
      (SELECT GROUP_CONCAT(r.name, ', ') FROM residents r WHERE r.homesite_id = h.id) as resident_names
    FROM homesites h ORDER BY h.street_number, h.street_name
  `)
  res.json(homes)
})

// Get resident detail with contact info (admin or own record)
app.get('/api/residents/:id', authMiddleware, (req, res) => {
  const residentId = parseInt(req.params.id)
  if (req.user.role !== 'admin' && req.user.resident_id !== residentId) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const resident = queryOne(`
    SELECT r.*, h.street_number, h.street_name
    FROM residents r
    JOIN homesites h ON h.id = r.homesite_id
    WHERE r.id = ?
  `, [residentId])

  if (!resident) return res.status(404).json({ error: 'Not found' })

  const phones = queryAll('SELECT * FROM phones WHERE resident_id = ?', [residentId])
  const emails = queryAll('SELECT * FROM emails WHERE resident_id = ?', [residentId])
  res.json({ ...resident, phones, emails })
})

// Update contact info (phones/emails) — resident can edit own only
app.put('/api/residents/:id/contacts', authMiddleware, (req, res) => {
  const residentId = parseInt(req.params.id)
  if (req.user.role !== 'admin' && req.user.resident_id !== residentId) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const { phones, emails } = req.body
  if (phones) {
    db.run('DELETE FROM phones WHERE resident_id = ?', [residentId])
    ;(Array.isArray(phones) ? phones : []).forEach(num => {
      if (num && num.trim()) db.run('INSERT INTO phones (resident_id, number) VALUES (?, ?)', [residentId, num.trim()])
    })
  }
  if (emails) {
    db.run('DELETE FROM emails WHERE resident_id = ?', [residentId])
    ;(Array.isArray(emails) ? emails : []).forEach(addr => {
      if (addr && addr.trim()) db.run('INSERT INTO emails (resident_id, address) VALUES (?, ?)', [residentId, addr.trim()])
    })
  }

  const newPhones = queryAll('SELECT * FROM phones WHERE resident_id = ?', [residentId])
  const newEmails = queryAll('SELECT * FROM emails WHERE resident_id = ?', [residentId])
  res.json({ phones: newPhones, emails: newEmails })
})

// Change password
app.put('/api/users/:id/password', authMiddleware, (req, res) => {
  const userId = parseInt(req.params.id)
  if (req.user.role !== 'admin' && req.user.id !== userId) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  const { currentPassword, newPassword } = req.body

  if (req.user.role !== 'admin') {
    const user = queryOne('SELECT password_hash FROM users WHERE id = ?', [userId])
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Current password incorrect' })
    }
  }

  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), userId])
  res.json({ ok: true })
})

// Start server
async function main() {
  try {
    const result = await initDatabase()
    global._saveDb = result.save

    app.listen(3000, () => console.log('Server running on http://localhost:3000'))
  } catch (err) {
    console.error('Failed to start:', err)
    process.exit(1)
  }
}

// Serve frontend static files (Vite build or dev)
const distPath = path.join(__dirname, 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')))
} else {
  app.get('/', (req, res) => res.send('Run `npm run dev:frontend` separately or build first'))
}

main()