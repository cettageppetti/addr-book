# Neighborhood Address Book

A React + Express web application for managing neighborhood homesites and resident contact information. Uses SQLite for local development.

## Features

- **JWT Authentication** - Secure login with httpOnly cookies
- **Role-based access**:
  - Residents can view and edit their own contact info (phones/emails)
  - Admins can view all homesites and residents
- **Charlotte NC Database** - 120 realistic homesites seeded on first run

## Tech Stack

- **Frontend**: React + Vite (Tailwind CSS)
- **Backend**: Express.js with better-sqlite3
- **Auth**: bcryptjs for passwords, jsonwebtoken for session management

## Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Navigate to project directory
cd ~/Code/addr-book

# Install dependencies
npm install

# Seed the database (one-time setup)
npm run seed

# Start development servers
npm run dev
```

The app will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## Default Credentials

### Admin Account
- Email: `admin@addrbook.local`
- Password: `ChangeThis123!`

### Resident Accounts
- Generated on seed (120 total)
- Pattern: `resident{N}@addrbook.local`
- Password: `Resident123!`

## Database Schema

### Tables
- **users**: id, email, password_hash, role (resident/admin), resident_id, created_at
- **homesites**: id, street_number, street_name, zip_code (28226), created_at
- **residents**: id, homesite_id (FK), name
- **phones**: id, resident_id (FK), number
- **emails**: id, resident_id (FK), address

### One-to-One Relationships
- Each homesite has one primary resident
- Each resident has 1+ phone numbers and 1+ email addresses

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate user, sets httpOnly cookie |
| POST | `/api/auth/logout` | Clear authentication cookie |
| GET | `/api/homesites` | Get homesites (all for admin, own for resident) |
| GET | `/api/residents/:id/contacts` | Get resident contact info |
| PUT | `/api/users/:id` | Update resident phones/emails |

## Project Structure

```
addr-book/
├── server.js          # Express backend with SQLite
├── seed.js            # Database seeding script
├── package.json
├── vite.config.ts     # Vite configuration with proxy
├── tsconfig.json      # TypeScript config
├── index.html         # Entry HTML
└── src/
    ├── main.tsx       # React entry point
    ├── App.tsx        # Main app component
    ├── index.css      # Global styles with Tailwind
    ├── components/
    │   ├── Layout.tsx         # App layout header/footer
    │   ├── Login.tsx          # Login form
    │   ├── HomesitesList.tsx  # Searchable homesite grid
    │   └── ResidentProfile.tsx# Contact editing view
    └── pages/
        └── Home.tsx         # Dynamic home page
```

## Development

### Running Tests
```bash
npm run build    # Type-check and build for production
npm run preview  # Preview production build
```

### Customization

**Change JWT Secret:**
```bash
export JWT_SECRET="your-secure-secret-key"
```

**Change Port:**
```bash
# Frontend (Vite)
npm run dev:frontend -- --port 4000

# Backend (Express)
PORT=3001 npm run dev:backend
```

## Database Management

The database file `addr-book.db` is created automatically in the project root when you run `npm run seed`.

To reset and re-seed:
```bash
rm addr-book.db
npm run seed
```

## Security Notes

- Passwords are hashed with bcryptjs (cost factor: 10)
- JWT tokens expire after 24 hours
- Cookies are set with `httpOnly: true` and `sameSite: strict`
- In production, enable `secure: true` on cookies

## License

MIT
