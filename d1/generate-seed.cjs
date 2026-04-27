// Usage: node generate-seed.cjs > d1/seed.sql
const bcrypt = require('bcryptjs')

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
const prefixes = ['555', '123', '456', '789']

let seed = 42
function rand(max) {
  seed = (seed * 1664525 + 1013904223) & 0xffffffff
  return Math.abs(seed) % max
}

const hashAdmin = bcrypt.hashSync('ChangeThis123!', 10)
const hashResident = bcrypt.hashSync('Resident123!', 10)

process.stdout.write(`-- Admin\nINSERT INTO users (email, password_hash, role) VALUES ('admin@addrbook.local', '${hashAdmin}', 'admin');\n\n`)

process.stdout.write(`-- 120 Homesites\n`)
for (let i = 0; i < 120; i++) {
  const num = rand(9000) + 100
  process.stdout.write(`INSERT INTO homesites (street_number, street_name, zip_code) VALUES ('${num}', '${streets[i % streets.length]}', '28226');\n`)
}

process.stdout.write(`\n-- Residents + contacts + user accounts\n`)
for (let i = 0; i < 120; i++) {
  const fName = firstNames[i % firstNames.length]
  const lName = lastNames[Math.floor(i / firstNames.length) % lastNames.length]
  const nameEscaped = `${fName} ${lName}`.replace(/'/g, "''")

  process.stdout.write(`\n-- Resident ${i + 1}\n`)
  process.stdout.write(`INSERT INTO residents (homesite_id, name) VALUES (${i + 1}, '${nameEscaped}');\n`)

  const numPhones = (i % 3) + 1
  for (let p = 0; p < numPhones; p++) {
    const ac = areaCodes[p % areaCodes.length]
    const px = prefixes[rand(prefixes.length)]
    const sx = rand(9000) + 1000
    process.stdout.write(`INSERT INTO phones (resident_id, number) VALUES ((SELECT id FROM residents WHERE homesite_id=${i + 1} ORDER BY id DESC LIMIT 1), '(${ac}) ${px}-${sx}');\n`)
  }

  const numEmails = (i % 2) + 1
  for (let e = 0; e < numEmails; e++) {
    const domain = ['gmail.com', 'yahoo.com', 'outlook.com'][e % 3]
    const suffix = e > 0 ? e : ''
    process.stdout.write(`INSERT INTO emails (resident_id, address) VALUES ((SELECT id FROM residents WHERE homesite_id=${i + 1} ORDER BY id DESC LIMIT 1), '${fName.toLowerCase()}.${lName.toLowerCase()}${suffix}@${domain}');\n`)
  }

  process.stdout.write(`INSERT INTO users (email, password_hash, role, resident_id) VALUES ('resident${i + 1}@addrbook.local', '${hashResident}', 'resident', (SELECT id FROM residents WHERE homesite_id=${i + 1} ORDER BY id DESC LIMIT 1));\n`)
}

console.error('Done — seed.sql generated')