// Standalone seed script — also runs automatically on server start
const initSqlJs = require('sql.js')
const bcrypt = require('bcryptjs')
const fs = require('fs')
const path = require('path')

const DB_PATH = path.join(__dirname, 'addr-book.db')

async function main() {
  const SQL = await initSqlJs()

  let db
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH)
    db = new SQL.Database(buf)
  } else {
    db = new SQL.Database()
  }

  // Create tables
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

  const count = db.exec('SELECT COUNT(*) FROM homesites')[0]?.values[0][0] || 0
  if (count >= 120) {
    console.log(`Database already has ${count} homesites. To re-seed, delete addr-book.db first.`)
    db.close()
    return
  }

  console.log(`Found ${count} homesites, seeding...`)

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
    db.run('INSERT INTO homesites (street_number, street_name) VALUES (?, ?)', [
      (Math.floor(Math.random() * 9000) + 100).toString(), streets[i % streets.length]
    ])
  }

  const homeIds = db.exec('SELECT id FROM homesites')[0]?.values.map(r => r[0]) || []

  for (let i = 0; i < homeIds.length; i++) {
    const firstName = firstNames[i % firstNames.length]
    const lastName = lastNames[i % lastNames.length]

    db.run('INSERT INTO residents (homesite_id, name) VALUES (?, ?)', [homeIds[i], `${firstName} ${lastName}`])
    const residentId = db.exec('SELECT last_insert_rowid()')[0]?.values[0][0]

    for (let p = 0; p < (i % 3) + 1; p++) {
      db.run('INSERT INTO phones (resident_id, number) VALUES (?, ?)', [
        residentId,
        `(${areaCodes[p % areaCodes.length]}) ${prefixes[Math.floor(Math.random() * prefixes.length)]}-${Math.floor(Math.random() * 9000) + 1000}`
      ])
    }

    for (let e = 0; e < (i % 2) + 1; e++) {
      const domain = ['gmail.com', 'yahoo.com', 'outlook.com'][e % 3]
      const suffix = e > 0 ? e.toString() : ''
      db.run('INSERT INTO emails (resident_id, address) VALUES (?, ?)', [
        residentId,
        `${firstName.toLowerCase()}.${lastName.toLowerCase()}${suffix}@${domain}`
      ])
    }

    db.run('INSERT INTO users (email, password_hash, role, resident_id) VALUES (?, ?, ?, ?)', [
      `resident${i + 1}@addrbook.local`, bcrypt.hashSync('Resident123!', 10), 'resident', residentId
    ])
  }

  try {
    db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [
      'admin@addrbook.local', bcrypt.hashSync('ChangeThis123!', 10), 'admin'
    ])
  } catch (e) { /* admin already exists */ }

  // Save
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()))

  const homes = db.exec('SELECT COUNT(*) FROM homesites')[0]?.values[0][0]
  const res = db.exec('SELECT COUNT(*) FROM residents')[0]?.values[0][0]
  const ph = db.exec('SELECT COUNT(*) FROM phones')[0]?.values[0][0]
  const em = db.exec('SELECT COUNT(*) FROM emails')[0]?.values[0][0]
  console.log(`Seeded: ${homes} homesites, ${res} residents, ${ph} phones, ${em} emails`)
  db.close()
}

main().catch(err => { console.error(err); process.exit(1) })