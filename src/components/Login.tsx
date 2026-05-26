import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input } from './ui'

export default function Login({ onLogin }: { onLogin: (user: any) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [needsSetup, setNeedsSetup] = useState(false)
  const [siteName, setSiteName] = useState('')
  const navigate = useNavigate()

  // Show the first-time credentials hint only while the default admin
  // hasn't changed its temporary password yet.
  useEffect(() => {
    fetch('/api/auth/setup-state')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setNeedsSetup(!!d.needs_setup) })
      .catch(() => {})
    fetch('/api/site-info')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setSiteName(d.site_name || '') })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Login failed')
      }

      onLogin(data)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-gray-900">
            Sign in to {siteName || 'Address Book'}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
              {error}
            </div>
          )}
          <div className="space-y-3">
            <div>
              <label htmlFor="email" className="sr-only">Email address</label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        {needsSetup && (
          <div className="text-center text-sm text-gray-600 border-t pt-4">
            <p className="font-medium text-gray-700">First-time setup</p>
            <p>Sign in as <span className="font-mono">admin@addrbook.local</span> / <span className="font-mono">ChangeThis123!</span></p>
            <p className="text-xs text-gray-500 mt-1">You'll be prompted to set a new password. This hint disappears afterward.</p>
          </div>
        )}
      </div>
    </div>
  )
}