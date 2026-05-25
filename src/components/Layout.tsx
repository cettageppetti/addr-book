import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface LayoutProps {
  user: { role: string; email: string } | null
  onLogout: () => void
  children: ReactNode
}

export default function Layout({ user, onLogout, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <Link to="/" className="text-xl font-bold text-gray-900 hover:text-indigo-600">
            Address Book
          </Link>

          {user && (
            <div className="flex items-center gap-4">
              <Link to="/settings" className="text-sm text-gray-600 hover:text-indigo-600">
                Settings
              </Link>
              <span className="text-gray-700 text-sm">
                {user.role === 'admin' ? 'Admin' : 'Resident'}: {user.email}
              </span>
              <button
                onClick={onLogout}
                className="text-sm text-gray-600 hover:text-red-600"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="py-8">
        {children}
      </main>
    </div>
  )
}