import { useState, useEffect, useRef } from 'react'
import { Button, Input, Badge } from '../components/ui'
import { THEMES, applyTheme } from '../lib/theme'

interface Props {
  user: { id: number; email: string; role: string; resident_id: number | null }
  onUserUpdate?: (user: any) => void
}

export default function Settings({ user, onUserUpdate }: Props) {
  const [loading,         setLoading]         = useState(false)
  const [success,         setSuccess]         = useState('')
  const [error,           setError]           = useState('')

  // Admin-only state
  const isAdmin = user.role === 'admin'
  const [users, setUsers] = useState<any[]>([])
  const [resetTarget, setResetTarget] = useState<number | null>(null)
  const [, setResetPassword] = useState('')
  const [, setConfirmReset] = useState('')
  const [resetting, setResetting] = useState(false)
  const [showAddUserForm, setShowAddUserForm] = useState(false)
  const [, setNewEmail] = useState('')
  const [, setNewPassword] = useState('')
  const [, setNewResidentId] = useState<string>('')
  const [residents, setResidents] = useState<any[]>([])
  const [addingUser, setAddingUser] = useState(false)

  // Directory listing opt-in (residents only): is the login email published
  // as a contact email on the resident's address-book profile?
  const isResident = !isAdmin && !!user.resident_id
  const [residentEmails, setResidentEmails] = useState<string[]>([])
  const [showLoginEmail, setShowLoginEmail] = useState(false)
  const [savingListing, setSavingListing] = useState(false)

  // Neighborhood address defaults (admin-editable) — prefill homesite forms.
  const [defaults, setDefaults] = useState({ default_city: '', default_state: '', default_zip_code: '' })
  const [savingDefaults, setSavingDefaults] = useState(false)

  // Community display name shown in the page header (blank = "Address Book").
  const [siteName, setSiteName] = useState('')
  const [savingSiteName, setSavingSiteName] = useState(false)

  // Community-wide color theme (admin-set).
  const [theme, setTheme] = useState('warm')

  // Reset add-user form fields whenever it opens
  useEffect(() => {
    if (showAddUserForm) {
      setNewEmail('')
      setNewPassword('')
      setNewResidentId('')
    }
  }, [showAddUserForm])

  // Uncontrolled refs for add-user form (avoids any React re-render issues)
  const newEmailRef      = useRef<HTMLInputElement>(null)
  const newPasswordRef   = useRef<HTMLInputElement>(null)
  const newResidentRef   = useRef<HTMLSelectElement>(null)
  const newRoleRef       = useRef<HTMLSelectElement>(null)

  // Account settings refs (uncontrolled — avoids React re-render issues with controlled inputs)
  const emailRef           = useRef<HTMLInputElement>(null)
  const currentPasswordRef = useRef<HTMLInputElement>(null)
  const passwordRef        = useRef<HTMLInputElement>(null)
  const confirmPasswordRef = useRef<HTMLInputElement>(null)

  // Admin password reset refs (uncontrolled — avoids controlled-input re-render conflicts)
  const resetPasswordRef    = useRef<HTMLInputElement>(null)
  const confirmResetRef     = useRef<HTMLInputElement>(null)

  // Load residents for admin user management on mount
  useEffect(() => {
    if (isAdmin && residents.length === 0) {
      fetchResidents()
    }
  }, [isAdmin, residents.length])

  const fetchResidents = async () => {
    try {
      const res = await fetch('/api/residents')
      if (res.ok) {
        const data = await res.json()
        setResidents(data)
      }
    } catch (err) {
      console.error('Failed to fetch residents:', err)
    }
  }

  // Load the resident's contact emails so the opt-in reflects current state.
  useEffect(() => {
    if (!isResident) return
    fetch(`/api/residents/${user.resident_id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) return
        const addrs: string[] = (data.emails || []).map((e: any) => e.address)
        setResidentEmails(addrs)
        setShowLoginEmail(addrs.includes(user.email))
      })
      .catch(() => {})
  }, [isResident, user.resident_id, user.email])

  // Add/remove the login email from the resident's published contact emails.
  const toggleLoginEmail = async (checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...residentEmails, user.email]))
      : residentEmails.filter(a => a !== user.email)
    setSavingListing(true); setError(''); setSuccess('')
    try {
      const res = await fetch(`/api/residents/${user.resident_id}/contacts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: next }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Update failed') }
      setResidentEmails(next)
      setShowLoginEmail(checked)
      setSuccess(checked
        ? 'Your login email now appears in your address book profile.'
        : 'Your login email was removed from your address book profile.')
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setSavingListing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const em   = emailRef.current?.value ?? ''
    const cur  = currentPasswordRef.current?.value ?? ''
    const pw   = passwordRef.current?.value ?? ''
    const cpw  = confirmPasswordRef.current?.value ?? ''

    if (pw || cpw) {
      if (pw !== cpw) {
        setError('New passwords do not match')
        return
      }
    }

    const body: any = {}
    if (em !== user.email)  body.email           = em
    if (pw)                 body.password         = pw
    if (pw)                 body.currentPassword  = cur

    if (Object.keys(body).length === 0) {
      setError('Nothing to update')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/profile', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
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
      emailRef.current!.value           = ''
      currentPasswordRef.current!.value = ''
      passwordRef.current!.value        = ''
      confirmPasswordRef.current!.value = ''
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleChangeRole = async (userId: number, role: 'admin' | 'resident') => {
    setError(''); setSuccess('')
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (res.ok) {
        fetchUsers()
        setSuccess(role === 'admin' ? 'User promoted to admin' : 'User changed to resident')
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to change role')
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

    const pw  = resetPasswordRef.current?.value ?? ''
    const cpw = confirmResetRef.current?.value ?? ''

    if (pw !== cpw) {
      setError('Passwords do not match')
      return
    }

    if (pw.length < 10) {
      setError('Password must be at least 10 characters')
      return
    }

    setResetting(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: pw }),
      })
      if (res.ok) {
        setSuccess(`Password reset for user ${userId}`)
        setResetTarget(null)
        resetPasswordRef.current!.value = ''
        confirmResetRef.current!.value  = ''
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

    const email      = newEmailRef.current?.value ?? ''
    const password   = newPasswordRef.current?.value ?? ''
    const residentId = parseInt(newResidentRef.current?.value ?? '0')

    if (!email || !password || !residentId) {
      setError('All fields are required')
      return
    }

    if (password.length < 10) {
      setError('Password must be at least 10 characters')
      return
    }

    setAddingUser(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: newRoleRef.current?.value ?? 'resident', resident_id: residentId }),
      })
      if (res.ok) {
        setShowAddUserForm(false)
        fetchUsers()
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
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data)
      }
    } catch (err) {
      console.error('Failed to fetch users:', err)
    }
  }

  // Load the neighborhood defaults for the admin's settings form.
  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setDefaults({ default_city: d.default_city || '', default_state: d.default_state || '', default_zip_code: d.default_zip_code || '' }); setSiteName(d.site_name || ''); setTheme(d.site_theme || 'warm') } })
      .catch(() => {})
  }, [isAdmin])

  const selectTheme = async (id: string) => {
    applyTheme(id)        // instant, app-wide preview
    setTheme(id)
    setError(''); setSuccess('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_theme: id }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Save failed') }
      setSuccess('Theme saved')
    } catch (err: any) {
      setError(err.message || 'Network error')
    }
  }

  const saveSiteName = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingSiteName(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_name: siteName.trim() }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Save failed') }
      const d = await res.json()
      setSiteName(d.site_name || '')
      // Update the header immediately (Layout listens for this).
      window.dispatchEvent(new CustomEvent('sitename', { detail: d.site_name || '' }))
      setSuccess('Community name saved')
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setSavingSiteName(false)
    }
  }

  const saveDefaults = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingDefaults(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaults),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Save failed') }
      const d = await res.json()
      setDefaults({ default_city: d.default_city || '', default_state: d.default_state || '', default_zip_code: d.default_zip_code || '' })
      setSuccess('Neighborhood defaults saved')
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setSavingDefaults(false)
    }
  }

  // Admin account section
  const AdminAccountSection = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900">Account</h3>

      <div className="bg-white shadow-sm rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
          <Input
            ref={emailRef}
            type="email"
            defaultValue={user.email}
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
          <Input
            ref={currentPasswordRef}
            type="password"
            defaultValue=""
            placeholder="••••••••"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <Input
            ref={passwordRef}
            type="password"
            defaultValue=""
            placeholder="Min. 10 characters"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
          <Input
            ref={confirmPasswordRef}
            type="password"
            defaultValue=""
            placeholder="Repeat new password"
          />
        </div>

        <Button type="button" onClick={handleSubmit} disabled={loading} className="w-full">
          {loading ? 'Saving...' : 'Save changes'}
        </Button>
      </div>

      <div className="bg-white shadow-sm rounded-2xl p-6 space-y-4">
        <div>
          <h4 className="text-md font-medium text-gray-900">Community name</h4>
          <p className="text-xs text-gray-500 mt-1">
            Shown as the title link at the top of every page. Leave blank to use "Address Book".
          </p>
        </div>
        <form onSubmit={saveSiteName} className="space-y-3">
          <Input
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Maple Grove Directory"
          />
          <Button type="submit" disabled={savingSiteName} className="w-full">
            {savingSiteName ? 'Saving...' : 'Save name'}
          </Button>
        </form>
      </div>

      <div className="bg-white shadow-sm rounded-2xl p-6 space-y-4">
        <div>
          <h4 className="text-md font-medium text-gray-900">Theme</h4>
          <p className="text-xs text-gray-500 mt-1">
            Sets the color theme for everyone in your community. Applies instantly.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {THEMES.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTheme(t.id)}
              aria-pressed={theme === t.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                theme === t.id
                  ? 'border-brand-600 ring-2 ring-brand-500 text-gray-900'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <span className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ backgroundColor: t.accent }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-2xl p-6 space-y-4">
        <div>
          <h4 className="text-md font-medium text-gray-900">Neighborhood defaults</h4>
          <p className="text-xs text-gray-500 mt-1">
            Pre-fills city, state, and ZIP when adding a homesite, so you don't re-type them for every home.
          </p>
        </div>
        <form onSubmit={saveDefaults} className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
              <Input
                type="text"
                value={defaults.default_city}
                onChange={(e) => setDefaults(d => ({ ...d, default_city: e.target.value }))}
                placeholder="City"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
              <Input
                type="text"
                value={defaults.default_state}
                onChange={(e) => setDefaults(d => ({ ...d, default_state: e.target.value }))}
                maxLength={2}
                placeholder="State"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-gray-500 mb-1">ZIP</label>
              <Input
                type="text"
                value={defaults.default_zip_code}
                onChange={(e) => setDefaults(d => ({ ...d, default_zip_code: e.target.value }))}
                placeholder="ZIP"
              />
            </div>
          </div>
          <Button type="submit" disabled={savingDefaults} className="w-full">
            {savingDefaults ? 'Saving...' : 'Save defaults'}
          </Button>
        </form>
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
                  ref={resetPasswordRef}
                  type="password"
                  placeholder="Min. 10 characters"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Confirm</label>
                <input
                  ref={confirmResetRef}
                  type="password"
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

      <div className="bg-white shadow-sm rounded-2xl overflow-hidden">
        {showAddUserForm ? (
          <div className="p-6 border-b border-gray-200">
            <form key={`add-user-form-${showAddUserForm}`} onSubmit={handleAddUserSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <Input
                    ref={newEmailRef}
                    type="email"
                    defaultValue=""
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <Input
                    ref={newPasswordRef}
                    type="password"
                    defaultValue=""
                    placeholder="Min. 10 characters"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                <select
                  ref={newRoleRef}
                  defaultValue="resident"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-brand-500 focus:border-brand-500 text-sm"
                >
                  <option value="resident">Resident</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Resident <span className="text-red-500">*</span>
                </label>
                <select
                  ref={newResidentRef}
                  defaultValue=""
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-brand-500 focus:border-brand-500 text-sm"
                >
                  <option value="">Select resident...</option>
                  {residents.map(res => (
                    <option key={res.id} value={res.id}>{res.name} — {res.homesite_address}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={addingUser}>
                  {addingUser ? 'Creating...' : 'Create User'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowAddUserForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddUserForm(true)}
            className="w-full py-3 border-b border-gray-200 text-brand-600 hover:bg-brand-50 transition-colors text-sm font-medium"
          >
            + Add User
          </button>
        )}
        
        <div className="overflow-x-auto">
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
                  <Badge tone={u.role === 'admin' ? 'success' : 'info'}>{u.role}</Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.resident_name || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {u.id === user.id ? (
                    <span className="text-gray-400 text-xs">Owner</span>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      {u.role === 'admin' ? (
                        <button
                          onClick={() => handleChangeRole(u.id, 'resident')}
                          className="text-gray-700 hover:text-gray-900 text-sm"
                        >
                          Make Resident
                        </button>
                      ) : (
                        <button
                          onClick={() => handleChangeRole(u.id, 'admin')}
                          disabled={!!u.must_change_password}
                          title={u.must_change_password ? 'User must set their own password before becoming an admin' : undefined}
                          className={`text-sm ${u.must_change_password ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                          Make Admin
                        </button>
                      )}
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => setResetTarget(u.id)}
                        className="text-brand-600 hover:text-brand-900 text-sm"
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
    </div>
  )

  // Resident account section
  const ResidentAccountSection = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900">My Account</h3>

      <div className="bg-white shadow-sm rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
          <Input
            ref={emailRef}
            type="email"
            defaultValue={user.email}
            placeholder="resident@example.com"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showLoginEmail}
            disabled={savingListing}
            onChange={(e) => toggleLoginEmail(e.target.checked)}
            className="mt-1"
          />
          <span>
            Add my login email to my address book profile
            <span className="block text-xs text-gray-500">Other residents will see {user.email} on your profile.</span>
          </span>
        </label>

        <hr className="border-gray-100" />

        <h4 className="text-sm font-medium text-gray-900">Change Password</h4>
        <p className="text-xs text-gray-500 -mt-2">
          Leave password fields blank to keep your current password.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Current password <span className="text-red-500">*</span>
          </label>
          <Input
            ref={currentPasswordRef}
            type="password"
            defaultValue=""
            placeholder="••••••••"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <Input
            ref={passwordRef}
            type="password"
            defaultValue=""
            placeholder="Min. 10 characters"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
          <Input
            ref={confirmPasswordRef}
            type="password"
            defaultValue=""
            placeholder="Repeat new password"
          />
        </div>

        <Button type="button" onClick={handleSubmit} disabled={loading} className="w-full">
          {loading ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
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
            {/* Rendered as function calls, not <Component/>, so these inline
                sections aren't remounted on every Settings re-render (which
                would drop focus from controlled inputs after one keystroke). */}
            {AdminAccountSection()}
            <div className="border-t pt-6">
              {AdminUserManagement()}
            </div>
          </>
        ) : (
          ResidentAccountSection()
        )}
      </div>
    </div>
  )
}
