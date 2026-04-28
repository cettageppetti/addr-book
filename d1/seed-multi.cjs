#!/usr/bin/env node
const sqlite3 = require('better-sqlite3')
const bcrypt  = require('bcryptjs')

const DB = `${process.env.HOME}/Code/addr-book/worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/2b35d4d42e3c9f6b5ad5b5579a7b1470c66e69f6b33a31e3f5a009cc6d18656.sqlite`

const db = sqlite3(DB)

const rand = (() => {
  let seed = 137
  return max => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return Math.abs(seed) % max }
})()

const pick = arr => arr[rand(arr.length)]
const randInt = (lo, hi) => lo + Math.floor(rand(hi - lo + 1))

const streets = [
  'Oak Street','Maple Avenue','Pine Road','Cedar Lane','Elm Drive',
  'Walnut Circle','Birch Court','Spruce Way','Ash Boulevard','Hickory Place',
  'Poplar Street','Willow Avenue','Sycamore Road','Chestnut Lane','Magnolia Drive',
  'Redwood Circle','Sequoia Court','Juniper Way','Cypress Boulevard','Palm Place',
  'Briar Ridge','Holloway Vale','Meadowbrook Lane','Riverstone Drive','Sunset Hills',
  'Cobblestone Path','Winding Way','Hidden Valley','Mountain View Road','Clearwater Creek',
  'Lakeside Drive','Pinehurst Court','Valley View Lane','Hilltop Road','Briarcliff Place',
  'Cherry Blossom Way','Wildflower Path','Sunrise Trail','Evening Star Road','Morning Glory Circle',
  'Autumn Leaf Drive','Winter Pine Lane','Spring Bloom Court','Summer Sun Way','Golden Oak Street',
  'Silver Maple Avenue','Bronze Pine Road','Titanium Court','Platinum Place','Diamond Drive',
  'Ruby Lane','Sapphire Circle','Emerald Boulevard','Amethyst Way','Topaz Place',
  'Jade Court','Onyx Drive','Pearl Lane','Coral Path','Lapis Circle',
  'Moonstone Road','Sunstone Drive','Azurite Way','Turquoise Place','Malachite Court'
]

const firstNames = [
  'John','Mary','James','Patricia','Robert','Jennifer','Michael','Linda',
  'William','Elizabeth','David','Barbara','Richard','Susan','Joseph','Jessica',
  'Thomas','Sarah','Charles','Karen','Christopher','Nancy','Daniel','Lisa',
  'Matthew','Betty','Anthony','Margaret','Mark','Sandra','Donald','Ashley',
  'Steven','Kimberly','Paul','Emily','Andrew','Donna','Joshua','Michelle',
  'Brian','Carol','Kevin','Amanda','Eric','Dorothy','Jason','Sharon',
  'Ryan','Laura','Jacob','Cynthia','Nicholas','Helen','Timothy','Jeffrey','Ruth'
]

const lastNames = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
  'Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson',
  'Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson',
  'White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker',
  'Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores',
  'Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell'
]

const adminHash    = bcrypt.hashSync('ChangeThis123!', 10)
const residentHash = bcrypt.hashSync('Resident123!', 10)

db.exec('BEGIN')

// Admin
const adminStmt = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
adminStmt.run('admin@addrbook.local', adminHash, 'admin')

// 120 homesites
const homeStmt = db.prepare('INSERT INTO homesites (street_number, street_name, zip_code) VALUES (?, ?, ?)')
const homesiteIds = []
for (let i = 0; i < 120; i++) {
  const num    = String(randInt(100, 9899))
  const street = streets[i % streets.length]
  homeStmt.run(num, street, '28226')
  homesiteIds.push(db.prepare('SELECT last_insert_rowid() as id').get().id)
}

// Residents (1-5 each) + record map so we can make emails with real names
const residentStmt   = db.prepare('INSERT INTO residents (homesite_id, name) VALUES (?, ?)')
const phoneStmt      = db.prepare('INSERT INTO phones (resident_id, number) VALUES (?, ?)')
const emailStmt      = db.prepare('INSERT INTO emails (resident_id, address) VALUES (?, ?)')
const userStmt       = db.prepare('INSERT INTO users (email, password_hash, role, resident_id) VALUES (?, ?, ?, ?)')

const residentsByHome = []

for (const hid of homesiteIds) {
  const numResidents = randInt(1, 5)
  const rids = []
  for (let j = 0; j < numResidents; j++) {
    const fname   = pick(firstNames)
    const lname   = pick(lastNames)
    const name    = `${fname} ${lname}`
    residentStmt.run(hid, name)
    const rid     = db.prepare('SELECT last_insert_rowid() as id').get().id
    rids.push({ rid, fname, lname })

    // 1-3 phones
    const areaCodes = ['704', '980']
    const prefixes  = ['555', '123', '456']
    for (let p = 0; p < randInt(1, 3); p++) {
      const ac = pick(areaCodes)
      const px = pick(prefixes)
      const sx = randInt(1000, 9999)
      phoneStmt.run(rid, `(${ac}) ${px}-${sx}`)
    }

    // 1-2 emails
    const domains = ['gmail.com', 'yahoo.com', 'outlook.com']
    for (let e = 0; e < randInt(1, 2); e++) {
      const domain = pick(domains)
      const suffix = e > 0 ? String(e) : ''
      emailStmt.run(rid, `${fname.toLowerCase()}.${lname.toLowerCase()}${suffix}@${domain}`)
    }

    // Per-resident address (40% of residents have a different one than the homesite)
    const hasOwnAddr = rand(100) < 40
    if (hasOwnAddr) {
      const streetNum = String(randInt(100, 9899))
      const unitSuffixes = [' Apt A', ' Apt B', ' Unit 1', ' Suite 100', ' Lot 5', '']
      const unit = pick(unitSuffixes)
      db.prepare('UPDATE residents SET address_street_number = ?, address_street_name = ?, city = ?, state = ? WHERE id = ?')
        .run(streetNum, `${streets[hid % streets.length]}${unit}`, 'Charlotte', 'NC', rid)
    }
  }
  residentsByHome.push(rids)

  // One resident user account per homesite (the first resident)
  const { rid } = rids[0]
  userStmt.run(`resident${hid}@addrbook.local`, residentHash, 'resident', rid)
}

db.exec('COMMIT')

// Stats
const { homes } = db.prepare('SELECT COUNT(*) as homes FROM homesites').get()
const { residents } = db.prepare('SELECT COUNT(*) as residents FROM residents').get()

// Distribution
const rows = db.prepare(
  'SELECT COUNT(*) as cnt FROM residents GROUP BY homesite_id ORDER BY cnt'
).all()
const dist = {}
for (const r of rows) dist[r.cnt] = (dist[r.cnt] || 0) + 1

console.log(`Homesites: ${homes}, Residents: ${residents}`)
console.log('Distribution:', Object.entries(dist).sort((a,b) => a[0]-b[0]).map(([k,v]) => `${v} homes with ${k}`).join(', '))

db.close()