import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import HomesitesList from '../components/HomesitesList'
import ResidentProfile from '../components/ResidentProfile'
import HomesiteEditor, { HomesiteAdminCard } from '../components/HomesiteEditor'
import { getAuthHeaders } from '../lib/auth'

export default function Home({ user }) {
  const [homesites, setHomesites] = useState([])
  const [loading, setLoading]     = useState(true)

  // Admin: which homesite is being edited (null = none, undefined = creating)
  const [editingId, setEditingId]   = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (user) fetchHomesites()
  }, [user])

  const fetchHomesites = async () => {
    try {
      const res = await fetch('/api/homesites', { headers: getAuthHeaders() })
      if (res.ok) setHomesites(await res.json())
    } finally {
      setLoading(false)
    }
  }

  if (!user) return <Navigate to="/login" replace />
  if (loading) return <div className="text-center py-12">Loading...</div>

  // Resident sees their own profile
  if (user.role === 'resident') {
    const myHome = homesites[0]
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">My Profile</h2>
        {myHome
          ? <ResidentProfile residentId={user.resident_id} />
          : <p className="text-gray-500">No profile found.</p>
        }
      </div>
    )
  }

  // ── Admin view ─────────────────────────────────────────────────────────────

  const handleSave = (saved: any) => {
    setEditingId(null)
    setShowCreate(false)
    if (editingId !== null) {
      // Editing existing: refresh to get updated data
      fetchHomesites()
    } else {
      // Created new: append to list
      setHomesites(prev => [...prev, saved])
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/homesites/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        setHomesites(prev => prev.filter(h => h.id !== id))
      }
    } catch {}
  }

  const editing = editingId != null ? homesites.find(h => h.id === editingId) : null

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-900">All Homesites</h2>
        <button
          onClick={() => { setShowCreate(true); setEditingId(null) }}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-medium"
        >
          + Add Homesite
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6">
          <HomesiteEditor
            homesite={null}
            onSave={handleSave}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {/* Edit form (inline at top) */}
      {editing && (
        <div className="mb-6">
          <HomesiteEditor
            homesite={editing}
            onSave={handleSave}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {homesites.map(h => (
          <HomesiteAdminCard
            key={h.id}
            homesite={h}
            onEdit={(home) => { setEditingId(home.id); setShowCreate(false) }}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {homesites.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No homesites yet. Add one above.
        </div>
      )}
    </div>
  )
}