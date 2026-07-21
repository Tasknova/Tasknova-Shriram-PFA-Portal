# Tasknova Admin Panel

A modern, full-featured admin panel for managing Tasknova platform data.

## Features

- 🔐 Secure authentication system
- 📊 Analytics dashboard
- 👥 Manage demo requests, jobs, applicants, blogs, and more
- 🎨 Modern, responsive UI
- 🔍 Search, filter, and pagination
- 📝 Full CRUD operations

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Supabase project set up

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
JWT_SECRET=your_jwt_secret
```

4. Run the Supabase migration to create the admins table:

- Go to your Supabase dashboard
- Navigate to SQL Editor
- Run the SQL from `supabase/migrations/001_create_admins_table.sql`

5. Update the default admin password hash:
   - Generate a bcrypt hash for your desired password
   - Update the INSERT statement in the migration

6. Start the development server:

```bash
npm run dev
```

7. Open [http://localhost:3000/admin/login](http://localhost:3000/admin/login)

## Default Admin Credentials

- Email: `admin@tasknova.com`
- Password: (set during migration)

## Project Structure

```
src/
├── app/
│   ├── admin/          # Admin panel routes
│   ├── api/            # API routes
│   └── layout.tsx      # Root layout
├── components/         # Reusable components
├── lib/               # Utilities and configs
└── types/             # TypeScript types
```

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT with HttpOnly cookies
- **Charts**: Chart.js

## Security

- Passwords are hashed using bcrypt
- JWT tokens stored in HttpOnly cookies
- Protected routes via middleware
- Role-based access control

## License

Proprietary - Tasknova
