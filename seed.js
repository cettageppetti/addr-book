const Database = require('better-sqlite3')

// Run this once to seed the database
console.log('Seeding Charlotte addresses...')

const db = new Database('addr-book.db')

// Seed Charlotte addresses
function seedAddresses() {
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
    db.prepare(`
      INSERT INTO users (email, password_hash, role, resident_id) 
      VALUES (?, ?, 'resident', ?)
    `).run(email, '$2a$10$placeholder', res.id) // Placeholder - will be hashed by server
  })

  console.log(`Seeded ${homesites.length} homesites with residents`)
}

seedAddresses()
