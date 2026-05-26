import { useState, type FormEvent } from 'react'
import { Button, Input } from './ui'

interface Props {
  user: { id: number; email: string }
  onDone: () => void
}

// Shown instead of the app when a user must set a new password (e.g. the
// seeded admin on first login). Blocks everything until the change succeeds.
export default function ChangePasswordGate({ user, onDone }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/users/${user.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not update password')
        return
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-sand flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-xl shadow-lg">
        <div>
          <h2 className="text-center text-2xl font-extrabold text-gray-900">Choose a new password</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Your account ({user.email}) is using a temporary password and must set a new one before continuing.
          </p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
          )}
          <Input
            type="password"
            required
            autoFocus
            placeholder="New password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            type="password"
            required
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Saving...' : 'Set password'}
          </Button>
        </form>
      </div>
    </div>
  )
}
