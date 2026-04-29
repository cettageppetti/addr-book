import { useState, useEffect } from 'react'
import { getAuthHeaders } from '../lib/auth'

interface Props {
  user: { id: number; email: string; role: string; resident_id: number | null }
  onUserUpdate?: (user: any) => void
}

export default function Settings({ user, onUserUpdate }: Props) {
  const [email,           setEmail]           = useState(user.email)
  const [currentPassword, setCurrentPassword] = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading,         setLoading]         = useState(false)
  const [success,         setSuccess]         = useState('')
  const [error,           setError]           = useState('')

  // Admin-only state
  const isAdmin = user.role === 'admin'
  const [users, setUsers] = useState<any[]>([])
  const [resetTarget, setResetTarget] = useState<number | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [confirmReset, setConfirmReset] = useState('')
  const [resetting, setResetting] = useState(false)
  const [showAddUserForm, setShowAddUserForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newResidentId, setNewResidentId] = useState<string>('')
  const [residents, setResidents] = useState<any[]>([])
  const [addingUser, setAddingUser] = useState(false)

  // Resident-only state
  const [phones, setPhones] = useState<string[]>([])
  const [newPhone, setNewPhone] = useState('')
  const [loadingPhones, setLoadingPhones] = useState(false)

  // Load resident phones on mount if resident
  useEffect(() => {
    if (!isAdmin && user.resident_id) {
      fetchPhones()
    }
  }, [user.resident_id, isAdmin])

  // Load residents for admin user management on mount
  useEffect(() => {
    if (isAdmin && residents.length === 0) {
      fetchResidents()
    }
  }, [isAdmin, residents.length])

  const fetchPhones = async () => {
    if (!user.resident_id) return
    setLoadingPhones(true)
    try {
      const res = await fetch(`/api/residents/${user.resident_id}/contacts`, {
        headers: getAuthHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setPhones(data.phones.map((p: any) => p.number))
      }
    } finally {
      setLoadingPhones(false)
    }
  }

  const fetchResidents = async () => {
    try {
      const res = await fetch('/api/residents', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setResidents(data)
      }
    } catch (err) {
      console.error('Failed to fetch residents:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (password || confirmPassword) {
      if (password !== confirmPassword) {
        setError('New passwords do not match')
        return
      }
    }

    const body: any = {}
    if (email !== user.email)  body.email           = email
    if (password)              body.password         = password
    if (password)              body.currentPassword  = currentPassword

    if (Object.keys(body).length === 0) {
      setError('Nothing to update')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/profile', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Update failed')
        return
      }
      
      const updatedUser = { ...user, email: data.user.email }
      if (onUserUpdate) onUserUpdate(updatedUser)
      
      // Update localStorage
      window.localStorage.setItem('user', JSON.stringify(updatedUser))
      
      setSuccess('Profile updated successfully')
      setEmail(data.user.email)
      setCurrentPassword('')
      setPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!newPhone.trim()) return
    
    const updatedPhones = [...phones, newPhone.trim()]
    
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ phones: updatedPhones }),
      })
      if (res.ok) {
        setPhones(updatedPhones)
        setNewPhone('')
        setSuccess('Phone number added')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to add phone')
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
    }
  }

  const removePhone = async (index: number) => {
    setError('')
    const updatedPhones = phones.filter((_, i) => i !== index)
    
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ phones: updatedPhones }),
      })
      if (res.ok) {
        setPhones(updatedPhones)
        setSuccess('Phone number removed')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to remove phone')
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
    }
  }

  const handleDeleteUser = async (userId: number) => {
    setError('')
    if (!confirm(`Confirm delete user ${userId}?`)) return
    
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        setUsers(users.filter(u => u.id !== userId))
        setSuccess('User deleted')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to delete user')
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
    }
  }

  const handleResetPassword = async (e: React.FormEvent, userId: number) => {
    e.preventDefault()
    setError('')
    
    if (resetPassword !== confirmReset) {
      setError('Passwords do not match')
      return
    }
    
    if (resetPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    
    setResetting(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ newPassword: resetPassword }),
      })
      if (res.ok) {
        setSuccess(`Password reset for user ${userId}`)
        setResetTarget(null)
        setResetPassword('')
        setConfirmReset('')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to reset password')
      }
    } finally {
      setResetting(false)
    }
  }

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!newEmail || !newPassword || !newResidentId) {
      setError('All fields are required')
      return
    }
    
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    
    setAddingUser(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ email: newEmail, password: newPassword, resident_id: parseInt(newResidentId) }),
      })
      if (res.ok) {
        const newUser = await res.json()
        setUsers([...users, newUser])
        setShowAddUserForm(false)
        setNewEmail('')
        setNewPassword('')
        setNewResidentId('')
        setSuccess('User created successfully')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to create user')
      }
    } finally {
      setAddingUser(false)
    }
  }

  // Load all users for admin
  useEffect(() => {
    if (isAdmin) {
      fetchUsers()
    }
  }, [isAdmin])

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setUsers(data)
      }
    } catch (err) {
      console.error('Failed to fetch users:', err)
    }
  }

  // Admin account section
  const AdminAccountSection = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900">Account</h3>
      
      <div className="bg-white shadow rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            placeholder="admin@example.com"
          />
        </div>

        <hr className="border-gray-100" />

        <p className="text-xs text-gray-500 -mt-2">
          Leave password fields blank to keep your current password.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Current password <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            placeholder="Min. 8 characters"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            placeholder="Repeat new password"
          />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 transition-colors"
        >
          {loading ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </div>
  )

  // Admin user management section
  const AdminUserManagement = () => (
    <div className="space-y-6 mt-8">
      <h3 className="text-lg font-medium text-gray-900">User Management</h3>

      {/* Password reset panel — shown above table when a reset is in progress */}
      {resetTarget !== null && (() => {
        const target = users.find(u => u.id === resetTarget)
        return target ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <p className="text-sm font-medium text-gray-800 mb-3">
              Reset password for <span className="text-amber-700">{target.email}</span>
            </p>
            <form onSubmit={(e) => handleResetPassword(e, resetTarget!)} className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">New password</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Confirm</label>
                <input
                  type="password"
                  value={confirmReset}
                  onChange={(e) => setConfirmReset(e.target.value)}
                  placeholder="Repeat password"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48"
                />
              </div>
              <button
                type="submit"
                disabled={resetting}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:bg-gray-400"
              >
                {resetting ? 'Saving...' : 'Save Password'}
              </button>
              <button
                type="button"
                onClick={() => { setResetTarget(null); setResetPassword(''); setConfirmReset('') }}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </form>
          </div>
        ) : null
      })()}

      <div className="bg-white shadow rounded-xl overflow-hidden">
        {showAddUserForm ? (
          <div className="p-6 border-b border-gray-200">
            <form onSubmit={handleAddUserSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    placeholder="Min. 8 characters"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Resident <span className="text-red-500">*</span>
                </label>
                <select
                  value={newResidentId}
                  onChange={(e) => setNewResidentId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                >
                  <option value="">Select resident...</option>
                  {residents.map(res => (
                    <option key={res.id} value={res.id}>{res.name} — {res.homesite_address}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={addingUser}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:bg-gray-400"
                >
                  {addingUser ? 'Creating...' : 'Create User'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddUserForm(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddUserForm(true)}
            className="w-full py-3 border-b border-gray-200 text-indigo-600 hover:bg-indigo-50 transition-colors text-sm font-medium"
          >
            + Add User
          </button>
        )}
        
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resident</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{u.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    u.role === 'admin' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.resident_name || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {u.id === user.id ? (
                    <span className="text-gray-400 text-xs">Owner</span>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setResetTarget(u.id)}
                        className="text-indigo-600 hover:text-indigo-900 text-sm"
                      >
                        Reset Password
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        className="text-red-600 hover:text-red-900 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  // Resident account section
  const ResidentAccountSection = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900">My Account</h3>
      
      <div className="bg-white shadow rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            placeholder="resident@example.com"
          />
        </div>

        <hr className="border-gray-100" />

        <h4 className="text-sm font-medium text-gray-900">Phone Numbers</h4>
        
        <form onSubmit={handlePhoneSubmit} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Add phone number"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          />
          <button
            type="submit"
            disabled={loadingPhones}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:bg-gray-400"
          >
            Add
          </button>
        </form>

        <div className="space-y-2">
          {phones.map((phone, index) => (
            <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg">
              <span className="text-sm text-gray-700">{phone}</span>
              <button
                onClick={() => removePhone(index)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Remove
              </button>
            </div>
          ))}
          {phones.length === 0 && (
            <p className="text-sm text-gray-500 italic">No phone numbers added yet.</p>
          )}
        </div>

        <hr className="border-gray-100" />

        <h4 className="text-sm font-medium text-gray-900">Change Password</h4>
        <p className="text-xs text-gray-500 -mt-2">
          Leave password fields blank to keep your current password.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Current password <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            placeholder="Min. 8 characters"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            placeholder="Repeat new password"
          />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 transition-colors"
        >
          {loading ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Account Settings</h2>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      <div className="space-y-8">
        {isAdmin ? (
          <>
            <AdminAccountSection />
            <div className="border-t pt-6">
              <AdminUserManagement />
            </div>
          </>
        ) : (
          <ResidentAccountSection />
        )}
      </div>
    </div>
  )
}
