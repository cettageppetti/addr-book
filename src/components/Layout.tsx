import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface LayoutProps {
  user: { role: string; email: string } | null
  onLogout: () => void
  children: ReactNode
}

export default function Layout({ user, onLogout, children }: LayoutProps) {
  const [siteName, setSiteName] = useState('')

  useEffect(() => {
    fetch('/api/site-info')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setSiteName(d.site_name || '') })
      .catch(() => {})
    // Update immediately when an admin saves a new name under Settings.
    const onChange = (e: Event) => setSiteName((e as CustomEvent<string>).detail || '')
    window.addEventListener('sitename', onChange)
    return () => window.removeEventListener('sitename', onChange)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xl font-bold text-indigo-600 hover:text-indigo-700 hover:underline"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10" />
            </svg>
            {siteName || 'Address Book'}
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
