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
  'Moonstone Road', 'Sunstone Drive', 'Azurite Way', 'Turquoise Place', 'Malachite Court'
]

const firstNames = [
  'John', 'Mary', 'James', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy', 'Daniel', 'Lisa',
  'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
  'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle',
  'Brian', 'Carol', 'Kevin', 'Amanda', 'Eric', 'Dorothy', 'Jason', 'Sharon',
  'Ryan', 'Laura', 'Jacob', 'Cynthia', 'Nicholas', 'Helen', 'Timothy', 'Sandra',
  'Jeffrey', 'Ruth', 'Benjamin', 'Karen'
]

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts'
]

const areaCodes = ['704', '980']
const prefixes  = ['555', '123', '456']

let seed = 137
function rand(max) {
  seed = (seed * 1664525 + 1013904223) & 0xffffffff
  return Math.abs(seed) % max
}

const hashAdmin    = bcrypt.hashSync('ChangeThis123!', 10)
const hashResident = bcrypt.hashSync('Resident123!', 10)

process.stdout.write(`-- Admin\n`)
process.stdout.write(`INSERT INTO users (email, password_hash, role) VALUES ('admin@addrbook.local', '${hashAdmin}', 'admin');\n\n`)

process.stdout.write(`-- 120 Homesites\n`)
for (let i = 0; i < 120; i++) {
  const num    = rand(9000) + 100
  const street = streets[i % streets.length]
  process.stdout.write(`INSERT INTO homesites (street_number, street_name, zip_code) VALUES ('${num}', '${street}', '28226');\n`)
}

// Build up all residents so we can assign user accounts to a stable set
process.stdout.write(`\n-- Residents\n`)
const residentRows = []

for (let h = 1; h <= 120; h++) {
  const numResidents = rand(5) + 1           // 1–5 per homesite
  for (let r = 0; r < numResidents; r++) {
    const fName      = firstNames[rand(firstNames.length)]
    const lName      = lastNames[rand(lastNames.length)]
    const nameEscaped = `${fName} ${lName}`.replace(/'/g, "''")
    process.stdout.write(`INSERT INTO residents (homesite_id, name) VALUES (${h}, '${nameEscaped}');\n`)
    residentRows.push({ homesiteId: h, name: `${fName} ${lName}`, firstName: fName, lastName: lName })
  }
}

process.stdout.write(`\n-- Phones\n`)
for (let i = 0; i < residentRows.length; i++) {
  const { homesiteId } = residentRows[i]
  // Pick the most-recently inserted resident at this homesite
  const numPhones = rand(3) + 1              // 1–3 phones each
  for (let p = 0; p < numPhones; p++) {
    const ac = areaCodes[rand(areaCodes.length)]
    const px = prefixes[rand(prefixes.length)]
    const sx = rand(9000) + 1000
    process.stdout.write(`INSERT INTO phones (resident_id, number)\n`)
    process.stdout.write(`  SELECT id, '(${ac}) ${px}-${sx}' FROM residents WHERE homesite_id=${homesiteId} ORDER BY id DESC LIMIT 1;\n`)
  }
}

process.stdout.write(`\n-- Emails\n`)
for (let i = 0; i < residentRows.length; i++) {
  const { homesiteId, firstName, lastName } = residentRows[i]
  const numEmails = rand(2) + 1             // 1–2 emails each
  for (let e = 0; e < numEmails; e++) {
    const domain  = ['gmail.com', 'yahoo.com', 'outlook.com'][rand(3)]
    const suffix  = e > 0 ? e : ''
    process.stdout.write(`INSERT INTO emails (resident_id, address)\n`)
    process.stdout.write(`  SELECT id, '${firstName.toLowerCase()}.${lastName.toLowerCase()}${suffix}@${domain}' FROM residents WHERE homesite_id=${homesiteId} ORDER BY id DESC LIMIT 1;\n`)
  }
}

process.stdout.write(`\n-- Resident user accounts (one per homesite — the first resident)\n`)
for (let h = 1; h <= 120; h++) {
  process.stdout.write(`INSERT INTO users (email, password_hash, role, resident_id)\n`)
  process.stdout.write(`  SELECT 'resident${h}@addrbook.local', '${hashResident}', 'resident', MIN(id) FROM residents WHERE homesite_id=${h};\n`)
}

console.error(`Done — ${residentRows.length} residents across 120 homesites`)