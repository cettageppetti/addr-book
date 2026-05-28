import { useEffect, useState } from 'react'
import { Navigate, Link, useLocation, useNavigate } from 'react-router-dom'
import ResidentProfile from '../components/ResidentProfile'
import { HomesiteAdder, HomesiteAdminCard, DEFAULT_PHOTO } from '../components/HomesiteEditor'
import { Button, Input, Card } from '../components/ui'

type Tab = 'homesites' | 'residents' | 'profile'

interface Homesite {
  id: number; street_number: string; street_name: string
  city?: string; state?: string; zip_code?: string
  has_photo?: number
  photo_version?: number
  residents?: { id: number; name: string }[]
}

interface Resident {
  id: number; name: string; homesite_id: number; homesite_address?: string
}

// ── Shared resident sorting ───────────────────────────────────────────────────
// homesite_address is "<number> <street name>", e.g. "123 Oak Street".
type SortField = 'name' | 'address'
const lastName   = (n: string) => n.trim().split(/\s+/).slice(-1)[0] || ''
const firstName  = (n: string) => n.trim().split(/\s+/).slice(0, -1).join(' ')
const streetName = (addr = '') => addr.replace(/^\s*\d+\s*/, '').trim()
const streetNum  = (addr = '') => parseInt(addr.match(/^\s*(\d+)/)?.[1] ?? '', 10) || 0
const alpha = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

// Name → last name then first; Address → street name then street number.
function compareResidents(a: Resident, b: Resident, field: SortField): number {
  if (field === 'name') {
    return alpha(lastName(a.name), lastName(b.name)) || alpha(firstName(a.name), firstName(b.name))
  }
  return alpha(streetName(a.homesite_address), streetName(b.homesite_address))
    || streetNum(a.homesite_address) - streetNum(b.homesite_address)
}

// Search box with a clear (✕) affordance, shared by the Homesites and
// Residents toolbars.
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative flex-1 min-w-0">
      <Input
        type="text"
        placeholder="Search by name or address..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          tabIndex={-1}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      )}
    </div>
  )
}

export default function Home({ user }: { user: any }) {
  const [loading, setLoading] = useState(true)
  const [tab,       setTab]   = useState<Tab>(() => {
    // Honor explicit deep-links (?tab= / ?homesite=) for everyone, including
    // residents, so a profile's address link can land on the Homesites tab.
    const params = new URLSearchParams(window.location.search)
    const p = params.get('tab')
    if (p === 'homesites' || p === 'residents') return p
    if (params.get('homesite')) return 'homesites'
    if (user?.role === 'resident') return 'profile'
    return (localStorage.getItem('addrtab') || 'homesites') as Tab
  })

  const [homesites, setHomesites]           = useState<Homesite[]>([])
  const [homesiteSearch, setHomesiteSearch] = useState('')
  const [residents, setResidents]           = useState<Resident[]>([])
  const [showCreateHomesite, setShowCreate] = useState(false)
  // When navigating from a resident's address to the Homesites tab: the id of
  // the card to scroll to, and the id to briefly highlight once it's shown.
  const [scrollHomesiteId,    setScrollHomesiteId]    = useState<number | null>(null)
  const [highlightHomesiteId, setHighlightHomesiteId] = useState<number | null>(null)

  const location = useLocation()
  const navigate = useNavigate()

  // Residents search + add are lifted here so the tabs and every tab's
  // search/add controls live in one sticky toolbar (see the render).
  const [residentSearch,   setResidentSearch]   = useState('')
  const [showAddResident,  setShowAddResident]  = useState(false)

  const openHomesite = (homesiteId: number) => {
    localStorage.setItem('addrtab', 'homesites')
    setShowCreate(false)
    setHomesiteSearch('')          // clear any filter so the target card is visible
    setScrollHomesiteId(homesiteId)
    setTab('homesites')
  }

  useEffect(() => {
    if (user) { fetchHomesites(); fetchResidents() }
  }, [user])

  // Deep-link from elsewhere (e.g. a resident's profile address): /?homesite=<id>
  // jumps to the Homesites tab, scrolls to the card, then cleans the URL. Works
  // whether Home mounts fresh or is already mounted (it reacts to location).
  useEffect(() => {
    const hid = new URLSearchParams(location.search).get('homesite')
    if (!hid) return
    openHomesite(Number(hid))
    navigate('/', { replace: true })
  }, [location.search])

  // Once the Homesites tab is rendered, scroll the requested card into view.
  useEffect(() => {
    if (tab !== 'homesites' || scrollHomesiteId == null) return
    const el = document.getElementById(`homesite-${scrollHomesiteId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightHomesiteId(scrollHomesiteId)
    setScrollHomesiteId(null)
  }, [tab, scrollHomesiteId, homesites])

  // Fade the highlight after a moment.
  useEffect(() => {
    if (highlightHomesiteId == null) return
    const t = setTimeout(() => setHighlightHomesiteId(null), 2000)
    return () => clearTimeout(t)
  }, [highlightHomesiteId])

  const fetchHomesites = async () => {
    try {
      const res = await fetch('/api/homesites')
      if (res.ok) setHomesites(await res.json())
    } finally { setLoading(false) }
  }

  const fetchResidents = async () => {
    try {
      const res = await fetch('/api/residents')
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



  const isAdmin = user.role === 'admin'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Sticky toolbar: the tabs AND the active tab's search/add controls live
          in one element, so the whole bar stays put while scrolling. It sticks
          at a single fixed offset (the header height) — no per-row measuring. */}
      <div className="sticky top-[var(--header-h)] z-30 bg-sand pt-4 pb-4 space-y-3">
        {/* Tabs */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {isAdmin && <h2 className="text-2xl font-bold text-gray-900">Administration</h2>}
          <div className="flex justify-end gap-1 bg-gray-100 rounded-lg p-1">
            {!isAdmin && (
              <button
                onClick={() => { localStorage.setItem('addrtab', 'profile'); setTab('profile') }}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  tab === 'profile' ? 'bg-white shadow text-brand-600' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                My Profile
              </button>
            )}
            {(['homesites', 'residents'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => {
                  localStorage.setItem('addrtab', t); setTab(t as Tab)
                  setShowCreate(false); setHomesiteSearch('')
                  setShowAddResident(false); setResidentSearch('')
                }}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors capitalize ${
                  tab === t ? 'bg-white shadow text-brand-600' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Homesites: search + add */}
        {tab === 'homesites' && (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <SearchBar value={homesiteSearch} onChange={setHomesiteSearch} />
            {isAdmin && <Button onClick={() => setShowCreate(true)}>+ Add Homesite</Button>}
          </div>
        )}

        {/* Residents: search + add */}
        {tab === 'residents' && (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <SearchBar value={residentSearch} onChange={setResidentSearch} />
            {isAdmin && <Button onClick={() => setShowAddResident(true)}>+ Add Resident</Button>}
          </div>
        )}
      </div>

      {/* ── Homesites tab content ─────────────────────────────────────── */}
      {tab === 'homesites' && (
        <>
          {isAdmin && showCreateHomesite && (
            <div className="mb-6">
              <HomesiteAdder onSave={() => { setShowCreate(false); fetchHomesites(); fetchResidents() }} />
            </div>
          )}

          {filteredHomesites.length > 0 || homesiteSearch === ''
            ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredHomesites.map(h => (
                  <div
                    key={h.id}
                    id={`homesite-${h.id}`}
                    className={`rounded-2xl transition-shadow ${highlightHomesiteId === h.id ? 'ring-2 ring-brand-500 ring-offset-2' : ''}`}
                  >
                    {isAdmin
                      ? <HomesiteAdminCard homesite={h}
                          onDelete={async (id) => {
                            await fetch(`/api/homesites/${id}`, { method: 'DELETE' })
                            setHomesites(prev => prev.filter(x => x.id !== id))
                          }}
                        />
                      : <HomesiteCard homesite={h} />}
                  </div>
                ))}
              </div>
            : <div className="text-center py-12 text-gray-500">No matching homesites found.</div>
          }

          {homesites.length === 0 && (
            <div className="text-center py-12 text-gray-500">No homesites yet.</div>
          )}
        </>
      )}

      {/* ── Residents tab content ─────────────────────────────────────── */}
      {tab === 'residents' && (isAdmin ? (
        <ResidentAdminPanel residents={residents} homesites={homesites}
          search={residentSearch}
          showAdd={showAddResident}
          setShowAdd={setShowAddResident}
          fetchResidents={fetchResidents}
          fetchHomesites={fetchHomesites}
          onOpenHomesite={openHomesite}
          onDelete={async (id) => {
            await fetch(`/api/residents/${id}`, { method: 'DELETE' })
            fetchResidents(); fetchHomesites()
          }}
        />
      ) : (
        <ResidentReadOnlyList residents={residents} search={residentSearch} onOpenHomesite={openHomesite} />
      ))}

      {/* ── My Profile tab (resident only) ─────────────────────────────── */}
      {tab === 'profile' && user?.resident_id && (
        <ResidentProfile user={user} residentId={String(user.resident_id)} activeTab={tab} onTabChange={(t) => { localStorage.setItem('addrtab', t); setTab(t as Tab) }} />
      )}
    </div>
  )
}

function ResidentAdminPanel({ residents, homesites, onDelete, fetchResidents, fetchHomesites, onOpenHomesite, search, showAdd, setShowAdd }: {
  residents: Resident[]; homesites: Homesite[]
  onDelete: (id: number) => void; fetchResidents: () => void; fetchHomesites: () => void
  onOpenHomesite: (homesiteId: number) => void
  // Search and add-form visibility are owned by Home (the sticky toolbar).
  search: string; showAdd: boolean; setShowAdd: (v: boolean) => void
}) {
  const [addName,     setAddName]     = useState('')
  const [addHomesite, setAddHomesite] = useState(homesites[0]?.id || 0)
  const [addSaving,   setAddSaving]   = useState(false)

  // Default the homesite select each time the add form is opened.
  useEffect(() => { if (showAdd) setAddHomesite(homesites[0]?.id || 0) }, [showAdd])

  // Sort state
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('asc')

  const handleSort = (field: SortField) => {
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
        headers: { 'Content-Type': 'application/json' },
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
      {/* Add row (toggled from the sticky toolbar's "+ Add Resident") */}
      {showAdd && (
        <form onSubmit={handleAdd}
          className="bg-brand-50 rounded-lg p-4 mb-4 flex gap-3 items-end flex-wrap border border-brand-200">
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
          <Button type="submit" size="sm" disabled={addSaving}>
            {addSaving ? 'Adding...' : 'Add Resident'}
          </Button>
          <Button type="button" variant="secondary" size="sm"
            onClick={() => { setShowAdd(false); setAddName('') }}>
            Cancel
          </Button>
        </form>
      )}

      <table className="w-full text-sm bg-white rounded-lg shadow">
        <thead>
          <tr className="text-left border-b text-gray-500 uppercase tracking-wide text-xs">
            <th
              className="px-4 py-3 cursor-pointer select-none hover:text-brand-600"
              onClick={() => handleSort('name')}
            >
              Name {sortField === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th
              className="px-4 py-3 cursor-pointer select-none hover:text-brand-600"
              onClick={() => handleSort('address')}
            >
              Homesite {sortField === 'address' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {[...filtered].sort((a, b) => {
            const cmp = compareResidents(a, b, sortField)
            return sortDir === 'asc' ? cmp : -cmp
          }).map(r => (
            <ResidentRow
              key={r.id}
              resident={r}
              homesites={homesites}
              onDelete={onDelete}
              onOpenHomesite={onOpenHomesite}
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

function ResidentRow({ resident, homesites, onDelete, onOpenHomesite }: {
  resident: Resident; homesites: Homesite[]
  onDelete: (id: number) => void
  onOpenHomesite: (homesiteId: number) => void
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
        headers: { 'Content-Type': 'application/json' },
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
          <Link to={`/residents/${resident.id}`} className="text-brand-600 hover:underline">{resident.name}</Link>
        </td>
        <td className="px-4 py-3 text-gray-500">
          <button
            type="button"
            onClick={() => onOpenHomesite(resident.homesite_id)}
            className="text-left text-brand-600 hover:underline"
            title="View this homesite"
          >
            {resident.homesite_address || `Homesite #${resident.homesite_id}`}
          </button>
        </td>
        <td className="px-4 py-3 text-right">
          {!editing && (
            <button
              onClick={() => { setName(resident.name); setHomesiteId(resident.homesite_id); setEditing(true) }}
              className="text-xs text-gray-500 hover:text-brand-600 mr-3"
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
        <tr className="bg-brand-50 border-b last:border-0">
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
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button type="button" variant="secondary" size="sm"
                onClick={() => { setName(resident.name); setHomesiteId(resident.homesite_id); setEditing(false) }}>
                Cancel
              </Button>
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
    <Card className="h-full hover:shadow-lg transition-shadow">
      <img
        src={homesite.has_photo ? `/api/homesites/${homesite.id}/photo?v=${homesite.photo_version ?? 0}` : DEFAULT_PHOTO}
        onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = DEFAULT_PHOTO }}
        alt="Homesite"
        className="w-full h-32 object-cover rounded border mb-3"
      />
      <h3 className="text-xl font-semibold text-gray-900">
        {homesite.street_number} {homesite.street_name}
      </h3>
      <p className="text-gray-400 text-sm mt-1">
        {homesite.city}, {homesite.state} {((homesite.zip_code || '') + '').replace(/\s/g, '')}
      </p>
      <p className="text-gray-400 text-sm">
        {residents.length} resident{residents.length !== 1 ? 's' : ''}
      </p>
      <div className="mt-2 space-y-1">
        {residents.map(r => (
          <Link key={r.id} to={`/residents/${r.id}`}
            className="block text-gray-500 text-sm hover:text-brand-600">
            {r.name}
          </Link>
        ))}
      </div>
    </Card>
  )
}

// ── Read-only resident list for residents ─────────────────────────────────────
function ResidentReadOnlyList({ residents, onOpenHomesite, search }: {
  residents: Resident[]
  onOpenHomesite: (homesiteId: number) => void
  search: string  // owned by Home (the sticky toolbar)
}) {
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('asc')
  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const filtered = residents.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.homesite_address || '').toLowerCase().includes(search.toLowerCase())
  )
  const sorted = [...filtered].sort((a, b) => {
    const cmp = compareResidents(a, b, sortField)
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div>

      <div className="overflow-x-auto">
        {sorted.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                <th
                  className="px-4 py-2 cursor-pointer select-none hover:text-brand-600"
                  onClick={() => handleSort('name')}
                >
                  Name {sortField === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer select-none hover:text-brand-600"
                  onClick={() => handleSort('address')}
                >
                  Address {sortField === 'address' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <Link to={`/residents/${r.id}`}
                      className="text-sm font-medium text-brand-600 hover:text-brand-800">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    <button
                      type="button"
                      onClick={() => onOpenHomesite(r.homesite_id)}
                      className="text-left text-brand-600 hover:underline"
                      title="View this homesite"
                    >
                      {r.homesite_address || '-'}
                    </button>
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