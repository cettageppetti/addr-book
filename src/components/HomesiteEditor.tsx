import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getAuthHeaders } from '../lib/auth'

interface Homesite {
  id: number
  street_number: string
  street_name: string
  city?: string
  state?: string
  zip_code?: string
}

interface Props {
  homesite?: Homesite | null   // null → create mode
  onSave: (homesite: Homesite) => void
  onCancel: () => void
}

export default function HomesiteEditor({ homesite, onSave, onCancel }: Props) {
  const [num, setNum]     = useState(homesite?.street_number || '')
  const [name, setName]   = useState(homesite?.street_name || '')
  const [city, setCity]   = useState(homesite?.city        || 'Charlotte')
  const [state, setState] = useState(homesite?.state       || 'NC')
  const [zip, setZip]     = useState(homesite?.zip_code    || '28226')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const isEdit = !!homesite?.id

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!num.trim() || !name.trim()) return
    setSaving(true)
    setError('')
    try {
      const method = isEdit ? 'PUT' : 'POST'
      const url     = isEdit ? `/api/homesites/${homesite.id}` : '/api/homesites'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ street_number: num.trim(), street_name: name.trim(), city: city.trim(), state: state.trim(), zip_code: zip.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Save failed')
      }
      const saved: Homesite = await res.json()
      onSave(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 border-2 border-indigo-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {isEdit ? 'Edit Homesite' : 'Add Homesite'}
      </h3>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-3">
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-500 mb-1">Street #</label>
            <input
              type="text"
              value={num}
              onChange={(e) => setNum(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500"
              placeholder="123"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Street Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500"
              placeholder="Oak Street"
              required
            />
          </div>
        </div>

        <div className="flex gap-3">
          <div className="w-48">
            <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500"
              placeholder="Charlotte"
            />
          </div>
          <div className="w-20">
            <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500"
              placeholder="NC"
            />
          </div>
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-500 mb-1">ZIP</label>
            <input
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500"
              placeholder="28226"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Homesite'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Single admin card with edit/delete controls ──────────────────────────────

interface CardProps {
  homesite: any
  onEdit: (h: any) => void
  onDelete: (id: number) => void
}

export function HomesiteAdminCard({ homesite, onEdit, onDelete }: CardProps) {
  const [confirming, setConfirming] = useState(false)
  const residents = homesite.residents || []

  const handleDelete = () => {
    if (!confirming) { setConfirming(true); return }
    onDelete(homesite.id)
  }

  return (
    <div className="block bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow relative">
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          onClick={() => onEdit(homesite)}
          className="text-xs text-gray-500 hover:text-indigo-600 font-medium"
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          className={`text-xs font-medium ${confirming ? 'text-red-600' : 'text-gray-400 hover:text-red-500'}`}
        >
          {confirming ? 'Confirm Delete?' : 'Delete'}
        </button>
        {confirming && (
          <button onClick={() => setConfirming(false)} className="text-xs text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        )}
      </div>

      <h3 className="text-xl font-semibold text-gray-900 pr-20">
        {homesite.street_number} {homesite.street_name}
      </h3>
      <p className="text-gray-400 text-sm mt-1">
        {residents.length} resident{residents.length !== 1 ? 's' : ''}
      </p>
      <div className="mt-2 space-y-1">
        {residents.map(r => (
          <Link
            key={r.id}
            to={`/residents/${r.id}`}
            className="block text-gray-500 text-sm hover:text-indigo-600"
          >
            {r.name}
          </Link>
        ))}
      </div>
    </div>
  )
}