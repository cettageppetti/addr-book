import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getAuthHeaders } from '../lib/auth'

interface Resident {
  id: number
  name: string
  street_number?: string
  street_name?: string
  zip_code?: string
  address_street_number?: string
  address_street_name?: string
  city?: string
  state?: string
  phones: { id: number; number: string }[]
  emails: { id: number; address: string }[]
}

interface Props {
  residentId?: string
  user: { role: string; resident_id?: number } | null
  activeTab?: 'homesites' | 'residents' | 'profile'
  onTabChange?: (tab: 'homesites' | 'residents') => void
}

export default function ResidentProfile({ residentId: propResidentId, user, activeTab, onTabChange }: Props) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlParams = useParams()
  // Prefer prop, fall back to URL param, then localStorage (for profile tab)
  const residentId = propResidentId || urlParams.id || (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').resident_id?.toString() } catch { return undefined }
  })()
  const [resident, setResident] = useState<Resident | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const canEdit = user?.role === 'admin' || String(user?.resident_id) === residentId

  useEffect(() => {
    if (!residentId) return
    ;(async () => {
      try {
        const res = await fetch(`/api/residents/${residentId}`, { headers: getAuthHeaders() })
        if (!res.ok) {
          throw new Error('Failed to load profile')
        }
        const data: Resident = await res.json()
        setResident(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    })()
  }, [residentId])

  if (loading) return <div className="text-center py-12">Loading...</div>
  if (error) return <div className="text-red-600 text-center py-12">{error}</div>
  if (!resident) return <div className="text-center py-12">Profile not found.</div>

  const phones = resident.phones ?? []
  const emails = resident.emails ?? []

  // Per-resident address overrides the shared homesite address
  const hasAddress = !!(resident.address_street_number || resident.address_street_name)
  const displayNum  = resident.address_street_number || resident.street_number
  const displayName = resident.address_street_name    || resident.street_name
  const city        = resident.city   || 'Charlotte'
  const state       = resident.state  || 'NC'
  const zip         = resident.zip_code || '28226'

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex justify-end gap-1 bg-gray-100 rounded-lg p-1 mb-4">
        {(['homesites', 'residents'] as const).map(t => {
          const isActive = activeTab === t || searchParams.get('tab') === t || localStorage.getItem('addrtab') === t
          return (
            <button key={t} onClick={() => { if (onTabChange) onTabChange(t); localStorage.setItem('addrtab', t); navigate(`/?tab=${t}`) }}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors capitalize ${
                isActive ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t}
            </button>
          )
        })}
        <button
          onClick={() => { localStorage.setItem('addrtab', 'profile'); navigate('/?tab=profile') }}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            activeTab === 'profile' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          My Profile
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">{resident.name}</h2>
        <p className="text-gray-600">
          {displayNum} {displayName}, {city} {state} {zip}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>

        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Phone Numbers</h4>
          {phones.length
            ? <ul className="space-y-2">{phones.map(p => (
                <li key={p.id} className="text-gray-700">{p.number}</li>
              ))}</ul>
            : <p className="text-gray-400 italic">None on file</p>
          }
        </div>

        <div className="mb-2">
          <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Email Addresses</h4>
          {emails.length
            ? <ul className="space-y-2">{emails.map(e => (
                <li key={e.id} className="text-gray-700">{e.address}</li>
              ))}</ul>
            : <p className="text-gray-400 italic">None on file</p>
          }
        </div>

        {canEdit && <ContactEditor resident={resident} onUpdate={setResident} />}
      </div>
    </div>
  )
}

function ContactEditor({ resident, onUpdate }: { resident: Resident; onUpdate: (r: Resident) => void }) {
  const [phoneVals, setPhoneVals] = useState(resident.phones.map(p => p.number))
  const [emailVals, setEmailVals] = useState(resident.emails.map(e => e.address))
  const [addrStreetNum, setAddrStreetNum]   = useState(resident.address_street_number || '')
  const [addrStreetName, setAddrStreetName] = useState(resident.address_street_name || '')
  const [city, setCity]     = useState(resident.city   || 'Charlotte')
  const [state, setState]   = useState(resident.state  || 'NC')
  const [zip, setZip]       = useState(resident.zip_code || '')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  const handleSaveContacts = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccess('')
    try {
      const res = await fetch(`/api/residents/${resident.id}/contacts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          phones: phoneVals.filter(p => p.trim()),
          emails: emailVals.filter(e => e.trim())
        })
      })
      if (!res.ok) throw new Error('Save failed')
      const data = await res.json()
      onUpdate({ ...resident, phones: data.phones, emails: data.emails })
      setSuccess('Changes saved successfully!')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccess('')
    try {
      const res = await fetch(`/api/residents/${resident.id}/address`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          address_street_number: addrStreetNum.trim(),
          address_street_name:   addrStreetName.trim(),
          city,
          state,
          zip_code: zip.trim()
        })
      })
      if (!res.ok) throw new Error('Save failed')
      const data: Resident = await res.json()
      onUpdate({ ...resident, ...data })
      setSuccess('Address saved successfully!')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const updatePhone = (i: number, val: string) => setPhoneVals(prev => prev.map((v, idx) => idx === i ? val : v))
  const updateEmail = (i: number, val: string) => setEmailVals(prev => prev.map((v, idx) => idx === i ? val : v))
  const addPhone    = () => setPhoneVals(prev => [...prev, ''])
  const addEmail    = () => setEmailVals(prev => [...prev, ''])

  return (
    <div className="mt-6 pt-6 border-t space-y-8">
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">{success}</div>
      )}

      {/* Contact info editor */}
      <form onSubmit={handleSaveContacts}>
        <h4 className="text-md font-medium text-gray-900 mb-3">Edit Contact Info</h4>

        <div className="mb-4">
          {phoneVals.map((val, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                type="text"
                value={val}
                onChange={(e) => updatePhone(i, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500"
              />
            </div>
          ))}
          <button type="button" onClick={addPhone} className="text-sm text-indigo-600 hover:text-indigo-800">
            + Add Phone
          </button>
        </div>

        <div className="mb-4">
          {emailVals.map((val, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                type="text"
                value={val}
                onChange={(e) => updateEmail(i, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500"
              />
            </div>
          ))}
          <button type="button" onClick={addEmail} className="text-sm text-indigo-600 hover:text-indigo-800">
            + Add Email
          </button>
        </div>

        <button type="submit" disabled={saving}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400">
          {saving ? 'Saving...' : 'Save Contacts'}
        </button>
      </form>

      {/* Address editor */}
      <form onSubmit={handleSaveAddress}>
        <h4 className="text-md font-medium text-gray-900 mb-3">Alternate Address</h4>
        <p className="text-sm text-gray-500 mb-4">
          Leave blank to use the shared homesite address, or enter a different address for this resident.
        </p>

        <div className="grid grid-cols-6 gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Street #</label>
            <input
              type="text"
              value={addrStreetNum}
              onChange={(e) => setAddrStreetNum(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500"
              placeholder="123"
            />
          </div>
          <div className="col-span-5">
            <label className="block text-xs text-gray-500 mb-1">Street Name</label>
            <input
              type="text"
              value={addrStreetName}
              onChange={(e) => setAddrStreetName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500"
              placeholder="Oak Street"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500"
              placeholder="Charlotte"
            />
          </div>
          <div className="w-20">
            <label className="block text-xs text-gray-500 mb-1">State</label>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500"
              placeholder="NC"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">ZIP</label>
            <input
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500"
              placeholder="28226"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400">
            {saving ? 'Saving...' : 'Save Address'}
          </button>
          <button type="button"
            onClick={() => {
              setAddrStreetNum('')
              setAddrStreetName('')
              setCity('Charlotte')
              setState('NC')
              setZip('')
            }}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
            Reset
          </button>
        </div>
      </form>
    </div>
  )
}