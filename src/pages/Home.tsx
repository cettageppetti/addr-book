import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import HomesitesList from '../components/HomesitesList'
import ResidentProfile from '../components/ResidentProfile'
import HomesiteEditor, { HomesiteAdminCard } from '../components/HomesiteEditor'
import { getAuthHeaders } from '../lib/auth'

type Tab = 'homesites' | 'residents'

interface Homesite {
  id: number; street_number: string; street_name: string
  city?: string; state?: string; zip_code?: string
  residents?: { id: number; name: string }[]
}

interface Resident {
  id: number; name: string; homesite_id: number; homesite_address?: string
}

export default function Home({ user }: { user: any }) {
  const [homesites, setHomesites] = useState<Homesite[]>([])
  const [homesiteSearch, setHomesiteSearch] = useState('')
  const [residents, setResidents] = useState<Resident[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<Tab>('homesites')

  // Admin edit state
  const [editingId, setEditingId]   = useState<number | null>(null)
  const [showCreateHomesite, setShowCreate] = useState(false)

  // Resident editor state
  const [editingResident, setEditingResident] = useState<Resident | null>(null)
  const [showCreateResident, setShowCreateResident] = useState(false)

  useEffect(() => {
    if (user) { fetchHomesites(); fetchResidents() }
  }, [user])

  const fetchHomesites = async () => {
    try {
      const res = await fetch('/api/homesites', { headers: getAuthHeaders() })
      if (res.ok) setHomesites(await res.json())
    } finally { setLoading(false) }
  }

  const fetchResidents = async () => {
    try {
      const res = await fetch('/api/residents', { headers: getAuthHeaders() })
      if (res.ok) setResidents(await res.json())
    } finally { setLoading(false) }
  }

  // Filtered homesites — matches address or resident name
  const filteredHomesites = homesiteSearch.trim()
    ? homesites.filter(h => {
        const q = homesiteSearch.toLowerCase()
        const addrMatch =
          `${h.street_number} ${h.street_name}`.toLowerCase().includes(q) ||
          (h.city || '').toLowerCase().includes(q)
        const residentMatch = (h.residents || []).some(
          (r: any) => r.name.toLowerCase().includes(q)
        )
        return addrMatch || residentMatch
      })
    : homesites

  if (!user) return <Navigate to="/login" replace />
  if (loading) return <div className="text-center py-12">Loading...</div>

  // ── Resident view ─────────────────────────────────────────────────────────
  if (user.role === 'resident') {
    const myHome = homesites[0]
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">My Profile</h2>
        {myHome ? <ResidentProfile residentId={String(user.resident_id)} /> : <p className="text-gray-500">No profile found.</p>}
      </div>
    )
  }

  // ── Admin view ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      {/* Tab bar */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-900">Administration</h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['homesites', 'residents'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setEditingId(null); setShowCreate(false); setHomesiteSearch(''); setEditingResident(null); setShowCreateResident(false) }}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors capitalize ${
                tab === t ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'homesites' && (
        <>
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <input
              type="text"
              placeholder="Search by name or address..."
              value={homesiteSearch}
              onChange={(e) => setHomesiteSearch(e.target.value)}
              className="max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500"
            />
            <button
              onClick={() => { setShowCreate(true); setEditingId(null) }}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-medium"
            >
              + Add Homesite
            </button>
          </div>

          {showCreateHomesite && (
            <div className="mb-6">
              <HomesiteEditor homesite={null} onSave={(h) => { setShowCreate(false); fetchHomesites() }} onCancel={() => setShowCreate(false)} />
            </div>
          )}

          {editingId != null && (
            <div className="mb-6">
              <HomesiteEditor
                homesite={homesites.find(h => h.id === editingId) || null}
                onSave={() => { setEditingId(null); fetchHomesites() }}
                onCancel={() => setEditingId(null)}
              />
            </div>
          )}

          {filteredHomesites.length > 0 || homesiteSearch === ''
            ? <HomesiteGrid
                homesites={filteredHomesites}
                onEdit={(id) => { setEditingId(id); setShowCreate(false) }}
                onDelete={async (id) => {
                  await fetch(`/api/homesites/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
                  setHomesites(prev => prev.filter(h => h.id !== id))
                }}
              />
            : <div className="text-center py-12 text-gray-500">No matching homesites found.</div>
          }

          {homesites.length === 0 && (
            <div className="text-center py-12 text-gray-500">No homesites yet. Add one above.</div>
          )}
        </>
      )}

      {/* ── Residents tab ─────────────────────────────────────────────── */}
      {tab === 'residents' && (
        <ResidentAdminPanel
          residents={residents}
          homesites={homesites}
          editingResident={editingResident}
          showCreate={!!showCreateResident}
          onEdit={(r) => { setEditingResident(r); setShowCreateResident(false) }}
          onDelete={async (id) => {
            await fetch(`/api/residents/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
            setResidents(prev => prev.filter(r => r.id !== id))
          }}
          onCreate={() => { setShowCreateResident(true); setEditingResident(null) }}
          onSaveNew={async (data) => {
            const res = await fetch('/api/residents', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
              body: JSON.stringify(data)
            })
            if (res.ok) { setShowCreateResident(false); fetchResidents() }
          }}
          onSaveEdit={async (id, data) => {
            const res = await fetch(`/api/residents/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
              body: JSON.stringify(data)
            })
            if (res.ok) { setEditingResident(null); fetchResidents() }
          }}
          onCancel={() => { setShowCreateResident(false); setEditingResident(null) }}
        />
      )}
    </div>
  )
}

// ── Homesite grid (extracted for clarity) ─────────────────────────────────────

function HomesiteGrid({ homesites, onEdit, onDelete }: { homesites: any[]; onEdit: (id: number) => void; onDelete: (id: number) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {homesites.map(h => (
        <HomesiteAdminCard
          key={h.id}
          homesite={h}
          onEdit={() => onEdit(h.id)}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

// ── Resident admin panel ───────────────────────────────────────────────────────

function ResidentAdminPanel({ residents, homesites, editingResident, showCreate, onEdit, onDelete, onCreate, onSaveNew, onSaveEdit, onCancel }: {
  residents: Resident[]; homesites: Homesite[]
  editingResident: Resident | null; showCreate: boolean
  onEdit: (r: Resident) => void; onDelete: (id: number) => void
  onCreate: () => void; onSaveNew: (d: any) => void
  onSaveEdit: (id: number, d: any) => void; onCancel: () => void
}) {
  const [search, setSearch]     = useState('')
  const [saving, setSaving]    = useState(false)
  const [sortField, setSortField] = useState<'name' | 'address'>('name')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('asc')

  const handleSort = (field: 'name' | 'address') => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  // Form state
  const [name,       setName]       = useState('')
  const [homesiteId, setHomesiteId] = useState<number>(0)

  const filtered = residents.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.homesite_address || '').toLowerCase().includes(search.toLowerCase())
  )

  const openCreate = () => {
    setName(''); setHomesiteId(homesites[0]?.id || 0)
    onCreate()
  }

  const openEdit = (r: Resident) => {
    setName(r.name); setHomesiteId(r.homesite_id)
    onEdit(r)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !homesiteId) return
    setSaving(true)
    try {
      if (editingResident) await onSaveEdit(editingResident.id, { name: name.trim(), homesite_id: homesiteId })
      else await onSaveNew({ name: name.trim(), homesite_id: homesiteId })
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <input
          type="text"
          placeholder="Search by name or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500"
        />
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-medium"
        >
          + Add Resident
        </button>
      </div>

      {(showCreate || editingResident) && (
        <div className="bg-white rounded-lg shadow p-6 mb-6 border-2 border-indigo-200">
          <h3 className="text-lg font-semibold mb-4">{editingResident ? 'Assign Resident Address' : 'Add Resident'}</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
              <input
                type="text" value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500"
                placeholder="Jane Doe" required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Homesite</label>
              <select
                value={homesiteId}
                onChange={(e) => setHomesiteId(Number(e.target.value))}
                className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500"
              >
                {homesites.map(h => (
                  <option key={h.id} value={h.id}>{h.street_number} {h.street_name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400">
                {saving ? 'Saving...' : editingResident ? 'Save Address' : 'Add Resident'}
              </button>
              <button type="button" onClick={onCancel}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <table className="w-full text-sm bg-white rounded-lg shadow">
        <thead>
          <tr className="text-left border-b text-gray-500 uppercase tracking-wide text-xs">
            <th
              className="px-4 py-3 cursor-pointer select-none hover:text-indigo-600"
              onClick={() => handleSort('name')}
            >
              Name {sortField === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th
              className="px-4 py-3 cursor-pointer select-none hover:text-indigo-600"
              onClick={() => handleSort('address')}
            >
              Homesite {sortField === 'address' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {[...filtered].sort((a, b) => {
            const cmp = sortField === 'name'
              ? (a.name.split(' ').slice(-1)[0] || a.name)
                  .localeCompare(b.name.split(' ').slice(-1)[0] || b.name)
              : (a.homesite_address || '').localeCompare(b.homesite_address || '')
            return sortDir === 'asc' ? cmp : -cmp
          }).map(r => (
            <ResidentRow
              key={r.id}
              resident={r}
              onEdit={() => openEdit(r)}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {residents.length ? 'No matches found.' : 'No residents yet. Add one above.'}
        </div>
      )}
    </>
  )
}

function ResidentRow({ resident, onEdit, onDelete }: { resident: Resident; onEdit: () => void; onDelete: (id: number) => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <tr className="border-b last:border-0 hover:bg-gray-50">
      <td className="px-4 py-3 font-medium text-gray-900">{resident.name}</td>
      <td className="px-4 py-3 text-gray-500">{resident.homesite_address || `Homesite #${resident.homesite_id}`}</td>
      <td className="px-4 py-3 text-right">
        <button onClick={onEdit} className="text-xs text-gray-500 hover:text-indigo-600 mr-3">Edit</button>
        <button
          onClick={() => { if (!confirming) { setConfirming(true); return } ; onDelete(resident.id) }}
          className={`text-xs font-medium ${confirming ? 'text-red-600' : 'text-gray-400 hover:text-red-500'}`}
        >
          {confirming ? 'Confirm?' : 'Delete'}
        </button>
        {confirming && <button onClick={() => setConfirming(false)} className="text-xs text-gray-400 hover:text-gray-600 ml-1">Cancel</button>}
      </td>
    </tr>
  )
}