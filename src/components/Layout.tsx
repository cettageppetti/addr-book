import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { applyTheme } from '../lib/theme'
import { applySiteName } from '../lib/site'

interface LayoutProps {
  user: { role: string; email: string } | null
  onLogout: () => void
  children: ReactNode
}

export default function Layout({ user, onLogout, children }: LayoutProps) {
  const [siteName, setSiteName] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    fetch('/api/site-info')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setSiteName(d.site_name || ''); applyTheme(d.site_theme); applySiteName(d.site_name) } })
      .catch(() => {})
    // Update immediately when an admin saves a new name under Settings.
    const onChange = (e: Event) => setSiteName((e as CustomEvent<string>).detail || '')
    window.addEventListener('sitename', onChange)
    return () => window.removeEventListener('sitename', onChange)
  }, [])

  return (
    <div className="min-h-screen bg-sand">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xl font-bold text-brand-600 hover:text-brand-700 hover:underline"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10" />
            </svg>
            {siteName || 'Address Book'}
          </Link>

          {user && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(o => !o)}
                aria-label="Menu"
                aria-expanded={menuOpen}
                className="-mr-2 p-2 rounded-lg text-gray-600 hover:text-brand-600 hover:bg-gray-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {menuOpen && (
                <>
                  {/* click-away layer */}
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-60 z-20 bg-white rounded-xl shadow-lg ring-1 ring-black/5 py-1">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        {user.role === 'admin' ? 'Admin' : 'Resident'}
                      </p>
                      <p className="text-sm text-gray-700 break-all">{user.email}</p>
                    </div>
                    <Link
                      to="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Settings
                    </Link>
                    <button
                      onClick={() => { setMenuOpen(false); onLogout() }}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
                    >
                      Logout
                    </button>
                  </div>
                </>
              )}
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
