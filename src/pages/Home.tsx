import { useEffect, useState } from 'react'
import { Navigate, Link, useSearchParams } from 'react-router-dom'
import ResidentProfile from '../components/ResidentProfile'
import { HomesiteAdder, HomesiteAdminCard } from '../components/HomesiteEditor'
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
  const [loading, setLoading] = useState(true)
  const [tab,       setTab]   = useState<Tab>(() => {
    const p = new URLSearchParams(window.location.search).get('tab')
    if (p === 'homesites' || p === 'residents') return p
    return (localStorage.getItem('addrtab') || 'homesites') as Tab
  })

  const [homesites, setHomesites]           = useState<Homesite[]>([])
  const [homesiteSearch, setHomesiteSearch] = useState('')
  const [residents, setResidents]           = useState<Resident[]>([])
  const [showCreateHomesite, setShowCreate] = useState(false)

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
    } finally { }
  }

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
        {myHome ? <ResidentProfile residentId={String(user.resident_id)} user={user} activeTab={tab} onTabChange={setTab} /> : <p className="text-gray-500">No profile found.</p>}
      </div>
    )
  }

  // ── Admin view ────────────────────────────────────────────────────────────
  const isAdmin = user.role === 'admin'

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      {/* Tab bar */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        {isAdmin && <h2 className="text-2xl font-bold text-gray-900">Administration</h2>}
        <div className="flex justify-end gap-1 bg-gray-100 rounded-lg p-1">
          {(['homesites', 'residents'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { localStorage.setItem('addrtab', t); setTab(t); setShowCreate(false); setHomesiteSearch('') }}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors capitalize ${
                tab === t ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Homesites tab ─────────────────────────────────────────────── */}
      {tab === 'homesites' && (
        <>
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                placeholder="Search by name or address..."
                value={homesiteSearch}
                onChange={(e) => setHomesiteSearch(e.target.value)}
className="w-full px-4 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-indigo-500"
              />
              {homesiteSearch && (
                <button
                  type="button"
                  onClick={() => setHomesiteSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-medium"
            >
              + Add Homesite
            </button>
          </div>

          {showCreateHomesite && (
            <div className="mb-6">
              <HomesiteAdder onSave={() => { setShowCreate(false); fetchHomesites() }} />
            </div>
          )}

          {filteredHomesites.length > 0 || homesiteSearch === ''
            ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredHomesites.map(h => isAdmin
                  ? <HomesiteAdminCard key={h.id} homesite={h}
                      onDelete={async (id) => {
                        await fetch(`/api/homesites/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
                        setHomesites(prev => prev.filter(x => x.id !== id))
                      }}
                    />
                  : <HomesiteCard key={h.id} homesite={h} />
                )}
              </div>
            : <div className="text-center py-12 text-gray-500">No matching homesites found.</div>
          }

          {homesites.length === 0 && (
            <div className="text-center py-12 text-gray-500">No homesites yet.</div>
          )}
        </>
      )}

      {/* ── Residents tab ─────────────────────────────────────────────── */}
      {tab === 'residents' && (isAdmin ? (
        <ResidentAdminPanel residents={residents} homesites={homesites}
          fetchResidents={fetchResidents}
          onDelete={async (id) => {
            await fetch(`/api/residents/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
            fetchResidents(); fetchHomesites()
          }}
        />
      ) : (
        <ResidentReadOnlyList residents={residents} homesites={homesites} />
      ))}
    </div>
  )
}

function ResidentAdminPanel({ residents, homesites, onDelete, fetchResidents }: {
  residents: Resident[]; homesites: Homesite[]
  onDelete: (id: number) => void; fetchResidents: () => void
}) {
  const [search,     setSearch]    = useState('')
  const [showAdd,    setShowAdd]   = useState(false)
  const [addName,     setAddName]     = useState('')
  const [addHomesite, setAddHomesite] = useState(homesites[0]?.id || 0)


  const [addSaving,   setAddSaving]   = useState(false)

  // Sort state
  const [sortField, setSortField] = useState<'name' | 'address'>('name')
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('asc')

  const handleSort = (field: 'name' | 'address') => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const filtered = residents.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.homesite_address || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addName.trim() || !addHomesite) return
    setAddSaving(true)
    try {
      const res = await fetch('/api/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: addName.trim(), homesite_id: addHomesite }),
      })
      if (res.ok) {
        const r = await res.json()
        // Build homesite_address for the new row
        const home = homesites.find(h => h.id === addHomesite)
        r.homesite_address = home ? `${home.street_number} ${home.street_name}` : `Homesite #${addHomesite}`
        fetchResidents(); fetchHomesites()
        setAddName('')
        setShowAdd(false)
      }
    } finally { setAddSaving(false) }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            placeholder="Search by name or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
className="w-full px-4 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-indigo-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={() => { setShowAdd(true); setAddHomesite(homesites[0]?.id || 0) }}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-medium"
        >
          + Add Resident
        </button>
      </div>

      {/* Add row */}
      {showAdd && (
        <form onSubmit={handleAdd}
          className="bg-indigo-50 rounded-lg p-4 mb-4 flex gap-3 items-end flex-wrap border border-indigo-200">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
            <input
              type="text" value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm w-52"
              placeholder="Jane Doe" required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Homesite</label>
            <select
              value={addHomesite}
              onChange={(e) => setAddHomesite(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm"
            >
              {[...homesites]
                .sort((a, b) => a.street_name.localeCompare(b.street_name) || +a.street_number - +b.street_number)
                .map(h => (
                  <option key={h.id} value={h.id}>{h.street_number} {h.street_name}</option>
                ))}
            </select>
          </div>
          <button type="submit" disabled={addSaving}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:bg-gray-400">
            {addSaving ? 'Adding...' : 'Add Resident'}
          </button>
          <button type="button"
            onClick={() => { setShowAdd(false); setAddName('') }}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">
            Cancel
          </button>
        </form>
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
              : (a.homesite_address || '').replace(/^\d+\s/, '')
                  .localeCompare((b.homesite_address || '').replace(/^\d+\s/, ''))
            return sortDir === 'asc' ? cmp : -cmp
          }).map(r => (
            <ResidentRow
              key={r.id}
              resident={r}
              homesites={homesites}
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

// ── Single resident row with inline edit form ─────────────────────────────────

function ResidentRow({ resident, homesites, onDelete }: {
  resident: Resident; homesites: Homesite[]
  onDelete: (id: number) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [editing,    setEditing]    = useState(false)
  const [name,       setName]       = useState(resident.name)
  const [homesiteId, setHomesiteId] = useState(resident.homesite_id)
  const [saving,     setSaving]     = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !homesiteId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/residents/${resident.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: name.trim(), homesite_id: Number(homesiteId) }),
      })
      if (res.ok) {
        const updated = await res.json()
        resident.name         = updated.name
        resident.homesite_id  = updated.homesite_id
        const home = homesites.find(h => h.id === updated.homesite_id)
        resident.homesite_address = home
          ? `${home.street_number} ${home.street_name}`
          : resident.homesite_address
        setEditing(false)
      }
    } finally { setSaving(false) }
  }

  return (
    <>
      <tr className="border-b last:border-0 hover:bg-gray-50">
        <td className="px-4 py-3 font-medium text-gray-900">
          <Link to={`/residents/${resident.id}`} className="text-indigo-600 hover:underline">{resident.name}</Link>
        </td>
        <td className="px-4 py-3 text-gray-500">{resident.homesite_address || `Homesite #${resident.homesite_id}`}</td>
        <td className="px-4 py-3 text-right">
          {!editing && (
            <button
              onClick={() => { setName(resident.name); setHomesiteId(resident.homesite_id); setEditing(true) }}
              className="text-xs text-gray-500 hover:text-indigo-600 mr-3"
            >
              Edit
            </button>
          )}
          <button
            onClick={() => { if (!confirming) { setConfirming(true); return }; onDelete(resident.id) }}
            className={`text-xs font-medium ${confirming ? 'text-red-600' : 'text-gray-400 hover:text-red-500'}`}
          >
            {confirming ? 'Confirm?' : 'Delete'}
          </button>
          {confirming && (
            <button onClick={() => setConfirming(false)} className="text-xs text-gray-400 hover:text-gray-600 ml-1">Cancel</button>
          )}
        </td>
      </tr>

      {editing && (
        <tr className="bg-indigo-50 border-b last:border-0">
          <td colSpan={3} className="px-4 py-3">
            <form onSubmit={(e) => { e.preventDefault(); handleSave() }}
              className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
                <input
                  type="text" value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm w-52"
                  placeholder="Jane Doe" required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Homesite</label>
                <select
                  value={homesiteId}
                  onChange={(e) => setHomesiteId(Number(e.target.value))}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm"
                >
                  {[...homesites]
                    .sort((a, b) => a.street_name.localeCompare(b.street_name) || +a.street_number - +b.street_number)
                    .map(h => (
                      <option key={h.id} value={h.id}>{h.street_number} {h.street_name}</option>
                    ))}
                </select>
              </div>
              <button type="submit" disabled={saving}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:bg-gray-400">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button type="button"
                onClick={() => { setName(resident.name); setHomesiteId(resident.homesite_id); setEditing(false) }}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">
                Cancel
              </button>
            </form>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Read-only homesite card for residents ─────────────────────────────────────
function HomesiteCard({ homesite }: { homesite: Homesite }) {
  const residents = homesite.residents || []
  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm">
      {homesite.photo !== undefined && (
        <img
          src={`/api/homesites/${homesite.id}/photo?${Date.now()}`}
          alt="Homesite"
          className="w-full h-32 object-cover rounded border mb-3"
        />
      )}
      <h3 className="text-xl font-semibold text-gray-900">
        {homesite.street_number} {homesite.street_name}
      </h3>
      <p className="text-gray-400 text-sm mt-1">
        {homesite.city || 'Charlotte'}, {(homesite.state || homesite.state_code) || 'NC'} {((homesite.zip_code || '') + '').replace(/\s/g, '')}
      </p>
      <p className="text-gray-400 text-sm">
        {residents.length} resident{residents.length !== 1 ? 's' : ''}
      </p>
      <div className="mt-2 space-y-1">
        {residents.map(r => (
          <Link key={r.id} to={`/residents/${r.id}`}
            className="block text-gray-500 text-sm hover:text-indigo-600">
            {r.name}
          </Link>
        ))}
      </div>
    </div>
  )
}

// ── Read-only resident list for residents ─────────────────────────────────────
function ResidentReadOnlyList({ residents, homesites }: {
  residents: Resident[]; homesites: Homesite[]
}) {
  const [search, setSearch] = useState('')
  const filtered = residents.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.homesite_address || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            placeholder="Search by name or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-indigo-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        {filtered.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <Link to={`/residents/${r.id}`}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {r.homesite_address || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-center py-8 text-gray-500">No matching residents found.</p>
        )}
      </div>
    </div>
  )
}