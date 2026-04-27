const express = require('express')
const cookieParser = require('cookie-parser')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Database = require('better-sqlite3')

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'addr-book-dev-secret-2024'
const JWT_EXPIRY = '24h'

// Initialize database
const db = new Database('addr-book.db')

// Create tables if not exist
db.exec(`
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

// Seed admin user if not exists
function seedAdmin() {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@addrbook.local')
  if (existing) return

  const password_hash = bcrypt.hashSync('ChangeThis123!', 10)
  db.prepare(`
    INSERT INTO users (email, password_hash, role) 
    VALUES (?, ?, 'admin')
  `).run('admin@addrbook.local', password_hash)
  console.log('Admin user created')
}

// Seed Charlotte addresses
function seedAddresses() {
  const count = db.prepare('SELECT COUNT(*) as c FROM homesites').get().c
  if (count >= 120) return

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

  const names = [
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

  const addresses = []
  for (let i = 1; i <= 120; i++) {
    const streetNum = Math.floor(Math.random() * 9000) + 100
    const streetIdx = i % streets.length
    addresses.push({
      street_number: streetNum.toString(),
      street_name: streets[streetIdx]
    })
  }

  const homesiteInsert = db.prepare(`
    INSERT INTO homesites (street_number, street_name) VALUES (?, ?)
  `)

  addresses.forEach(addr => homesiteInsert.run(addr.street_number, addr.street_name))

  // Get all homesites
  const homesites = db.prepare('SELECT id, street_number, street_name FROM homesites').all()

  const residentInsert = db.prepare(`
    INSERT INTO residents (homesite_id, name) VALUES (?, ?)
  `)

  const phoneInsert = db.prepare(`
    INSERT INTO phones (resident_id, number) VALUES (?, ?)
  `)

  const emailInsert = db.prepare(`
    INSERT INTO emails (resident_id, address) VALUES (?, ?)
  `)

  const areaCodes = ['704', '980', '723']
  const prefixes = ['555', '123', '456', '789', '321']

  homesites.forEach((home, idx) => {
    const firstName = names[idx % names.length]
    const lastName = lastNames[idx % lastNames.length]
    const residentName = `${firstName} ${lastName}`
    
    const resId = residentInsert.run(home.id, residentName).lastRowID

    // Add 1-3 phone numbers
    const numPhones = (idx % 3) + 1
    for (let p = 0; p < numPhones; p++) {
      const areaCode = areaCodes[p % areaCodes.length]
      const prefix = prefixes[p % prefixes.length]
      const suffix = Math.floor(Math.random() * 9000) + 1000
      phoneInsert.run(resId, `(${areaCode}) ${prefix}-${suffix}`)
    }

    // Add 1-2 email addresses
    const numEmails = (idx % 2) + 1
    for (let e = 0; e < numEmails; e++) {
      const domain = e === 0 ? 'gmail.com' : 'email.com'
      emailInsert.run(resId, `${firstName.toLowerCase()}.${lastName.toLowerCase()}${e}@${domain}`)
    }
  })

  // Link residents to users
  const residents = db.prepare('SELECT id FROM residents').all()
  residents.forEach((res, idx) => {
    if (idx === 0) return // Skip first - will be admin
    const email = `resident${idx}@addrbook.local`
    const password_hash = bcrypt.hashSync('Resident123!', 10)
    db.prepare(`
      INSERT INTO users (email, password_hash, role, resident_id) 
      VALUES (?, ?, 'resident', ?)
    `).run(email, password_hash, res.id)
  })

  console.log(`Seeded ${homesites.length} homesites with residents`)
}

// Initialize
seedAdmin()
seedAddresses()

const app = express()
app.use(cookieParser())
app.use(express.json())

// Middleware
function authRequired(req, res, next) {
  const token = req.cookies.token
  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Routes
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' })
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const valid = bcrypt.compareSync(password, user.password_hash)
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  )

  res.cookie('token', token, {
    httpOnly: true,
    secure: false, // false for local dev
    sameSite: 'strict',
  })

  res.json({
    success: true,
    user: { id: user.id, email: user.email, role: user.role }
  })
})

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token')
  res.json({ success: true })
})

app.get('/api/homesites', authRequired, (req, res) => {
  let homesites
  if (req.user.role === 'admin') {
    // Admin sees all homesites with their primary resident
    const query = `
      SELECT h.*, 
             (SELECT r.name FROM residents r WHERE r.homesite_id = h.id LIMIT 1) as resident_name,
             (SELECT r.id FROM residents r WHERE r.homesite_id = h.id LIMIT 1) as resident_id
      FROM homesites h 
      ORDER BY h.street_number
    `
    homesites = db.prepare(query).all()
  } else {
    // Residents only see their own homesite
    const query = `
      SELECT h.*, 
             (SELECT r.name FROM residents r WHERE r.homesite_id = h.id LIMIT 1) as resident_name,
             (SELECT r.id FROM residents r WHERE r.homesite_id = h.id LIMIT 1) as resident_id
      FROM homesites h 
      WHERE h.id = (SELECT homesite_id FROM residents r WHERE r.id = ?)
    `
    homesites = db.prepare(query).all(req.user.resident_id)
  }
  res.json({ homesites })
})

app.get('/api/residents/:id/contacts', authRequired, (req, res) => {
  const residentId = parseInt(req.params.id)

  // Check permissions
  if (req.user.role !== 'admin' && req.user.resident_id !== residentId) {
    return res.status(403).json({ error: 'Permission denied' })
  }

  const resident = db.prepare(`
    SELECT r.*, h.street_number, h.street_name
    FROM residents r
    JOIN homesites h ON r.homesite_id = h.id
    WHERE r.id = ?
  `).get(residentId)

  if (!resident) {
    return res.status(404).json({ error: 'Resident not found' })
  }

  const phones = db.prepare('SELECT * FROM phones WHERE resident_id = ?').all(residentId)
  const emails = db.prepare('SELECT * FROM emails WHERE resident_id = ?').all(residentId)

  res.json({
    resident: {
      id: resident.id,
      name: resident.name,
      homesite_id: resident.homesite_id,
      street_number: resident.street_number,
      street_name: resident.street_name
    },
    phones,
    emails
  })
})

app.put('/api/users/:id', authRequired, (req, res) => {
  const userId = parseInt(req.params.id)

  // Check permissions
  if (req.user.role !== 'admin' && req.user.id !== userId) {
    return res.status(403).json({ error: 'Permission denied' })
  }

  const { phones, emails } = req.body
  const residentId = db.prepare('SELECT resident_id FROM users WHERE id = ?').get(userId)?.resident_id

  if (!residentId) {
    return res.status(404).json({ error: 'User not found' })
  }

  // Update phones
  if (phones) {
    db.prepare('DELETE FROM phones WHERE resident_id = ?').run(residentId)
    const insertPhone = db.prepare('INSERT INTO phones (resident_id, number) VALUES (?, ?)')
    phones.forEach(p => insertPhone.run(residentId, p))
  }

  // Update emails
  if (emails) {
    db.prepare('DELETE FROM emails WHERE resident_id = ?').run(residentId)
    const insertEmail = db.prepare('INSERT INTO emails (resident_id, address) VALUES (?, ?)')
    emails.forEach(e => insertEmail.run(residentId, e))
  }

  res.json({ success: true })
})

app.get('/api/auth/status', authRequired, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email, role: req.user.role } })
})

// Serve static files from frontend build
const path = require('path')
app.use(express.static(path.join(__dirname, 'dist')))

// Handle SPA routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
