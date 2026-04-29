import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getAuthHeaders } from '../lib/auth'
import { fileToJpegBlob, isImage, blobSize } from '../lib/photo'

const PHOTO_ENDPOINT = (id: number) => `/api/homesites/${id}/photo`
const DEFAULT_PHOTO = '/default-home.jpg'

// ── Standalone "Add Homesite" form (used in Home.tsx) ────────────────────────
interface AddProps { onSave: (h: any) => void }
export function HomesiteAdder({ onSave }: AddProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [num,   setNum]   = useState('')
  const [name,  setName]  = useState('')
  const [city,  setCity]  = useState('Charlotte')
  const [state, setState] = useState('NC')
  const [zip,   setZip]   = useState('28226')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [saving,   setSaving] = useState(false)
  const [error,    setError]  = useState('')

  // Upload a blob to the photo endpoint
  const uploadPhoto = async (id: number, blob: Blob) => {
    await fetch(PHOTO_ENDPOINT(id), {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: blob,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!num.trim() || !name.trim()) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/homesites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ street_number: num.trim(), street_name: name.trim(), city: city || 'Charlotte', state: state || 'NC', zip_code: zip || '28226' }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Save failed') }
      const home = await res.json()
      if (photoBlob) await uploadPhoto(home.id, photoBlob)
      onSave(home)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 border-2 border-indigo-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Homesite</h3>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-3">
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-500 mb-1">Street #</label>
            <input type="text" value={num} onChange={e => setNum(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500" placeholder="123" required />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Street Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500" placeholder="Oak Street" required />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
            <input type="text" value={city} onChange={e => setCity(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500" placeholder="Charlotte" required />
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
            <input type="text" value={state} onChange={e => setState(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500" placeholder="NC" maxLength={2} required />
          </div>
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-500 mb-1">ZIP</label>
            <input type="text" value={zip} onChange={e => setZip(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500" placeholder="28226" required />
          </div>
        </div>

        {/* Photo upload */}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            if (!isImage(file)) { setError('Please select an image file'); return }
            try {
              const blob = await fileToJpegBlob(file)
              setPhotoBlob(blob)
              if (previewUrl) URL.revokeObjectURL(previewUrl)
              setPreviewUrl(URL.createObjectURL(blob))
            } catch { setError('Failed to process image') }
          }} />
        <div className="flex items-center gap-3">
          {previewUrl
            ? <div className="flex items-center gap-2">
                <img src={previewUrl} alt="Homesite" className="h-16 w-16 object-cover rounded border" />
                <span className="text-xs text-gray-500">{blobSize(photoBlob!)}</span>
                <button type="button" onClick={() => {
                  if (previewUrl) URL.revokeObjectURL(previewUrl)
                  setPhotoBlob(null); setPreviewUrl(null)
                  if (fileRef.current) fileRef.current.value = ''
                }} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
            : <button type="button" onClick={() => fileRef.current?.click()}
              className="text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-3 py-1.5 hover:bg-indigo-50">📷 Add Photo</button>
          }
        </div>

        <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400">
          {saving ? 'Adding...' : 'Add Homesite'}
        </button>
      </form>
    </div>
  )
}

// ── Single admin card with inline edit form ───────────────────────────────────
interface CardProps { homesite: any; onDelete: (id: number) => void }

export function HomesiteAdminCard({ homesite, onDelete }: CardProps) {
  const fileRef      = useRef<HTMLInputElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [editing,    setEditing]    = useState(false)
  const [num,        setNum]        = useState(homesite.street_number || '')
  const [name,       setName]       = useState(homesite.street_name || '')
  const [city,       setCity]       = useState(homesite.city || '')
  const [state,      setState]      = useState(homesite.state || '')
  const [zip,        setZip]        = useState(homesite.zip_code || '')
  // pendingBlob: new photo selected but not yet saved; null = no change
  const [pendingBlob, setPendingBlob]   = useState<Blob | null>(null)
  const [pendingUrl, setPendingUrl]     = useState<string | null>(null)
  // deletePhoto: true when user wants to remove existing photo
  const [deletePhoto, setDeletePhoto]   = useState(false)
  const [saving,    setSaving]  = useState(false)

  // True when user selected a new photo (show preview + "remove" option)
  const hasPending = pendingBlob !== null || deletePhoto
  // URL to show in the preview — pending if available, otherwise homesite photo
  const previewSrc = pendingUrl ?? (!deletePhoto ? PHOTO_ENDPOINT(homesite.id) : null)

  const residents = homesite.residents || []

  const handleDelete = () => {
    if (!confirming) { setConfirming(true); return }
    onDelete(homesite.id)
  }

  const handleSave = async () => {
    if (!num.trim() || !name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/homesites/${homesite.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ street_number: num.trim(), street_name: name.trim(), city: city.trim(), state: state.trim(), zip_code: zip.trim() }),
      })
      if (!res.ok) { throw new Error('Save failed') }
      const updated = await res.json()
      homesite.street_number = updated.street_number
      homesite.street_name   = updated.street_name
      homesite.city          = updated.city || ''
      homesite.state         = updated.state || ''
      homesite.zip_code      = updated.zip_code

      // Upload new photo, remove existing, or leave as-is
      if (deletePhoto) {
        await fetch(PHOTO_ENDPOINT(homesite.id), { method: 'DELETE', headers: getAuthHeaders() })
      }
      if (pendingBlob) {
        await fetch(PHOTO_ENDPOINT(homesite.id), {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: pendingBlob,
        })
      }

      setEditing(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const cancelEdit = () => {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl)
    setEditing(false)
    setPendingBlob(null); setPendingUrl(null); setDeletePhoto(false)
    setNum(homesite.street_number); setName(homesite.street_name)
    setCity(homesite.city || ''); setState(homesite.state || '')
    setZip(homesite.zip_code || '')
  }

  return (
    <div className="block bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow relative">
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        {!editing && (
          <button onClick={() => setEditing(true)}
            className="text-xs text-gray-500 hover:text-indigo-600 font-medium">
            Edit
          </button>
        )}
        <button onClick={handleDelete}
          className={`text-xs font-medium ${confirming ? 'text-red-600' : 'text-gray-400 hover:text-red-500'}`}>
          {confirming ? 'Confirm Delete?' : 'Delete'}
        </button>
        {confirming && (
          <button onClick={() => setConfirming(false)} className="text-xs text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        )}
      </div>

      {/* Photo thumbnail */}
      <img
        src={previewSrc || DEFAULT_PHOTO}
        alt="Homesite"
        className="w-full h-32 object-cover rounded mb-3 border"
      />

      <h3 className="text-xl font-semibold text-gray-900 pr-20">
        {homesite.street_number} {homesite.street_name}
      </h3>

      {!editing ? (
        <>
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
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); handleSave() }} className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input value={num}   onChange={e => setNum(e.target.value)}  placeholder="#"    className="w-16 flex-shrink-0 px-2 py-1 border rounded text-sm" required />
            <input value={name}  onChange={e => setName(e.target.value)} placeholder="Street" className="flex-1 px-2 py-1 border rounded text-sm" required />
          </div>
          <div className="flex gap-2">
            <input value={city}  onChange={e => setCity(e.target.value)}  placeholder="City"   className="flex-1 px-2 py-1 border rounded text-sm" required />
            <input value={state} onChange={e => setState(e.target.value)} placeholder="ST"     className="w-14 px-2 py-1 border rounded text-sm" maxLength={2} required />
            <input value={zip}   onChange={e => setZip(e.target.value)}  placeholder="ZIP"    className="w-24 px-2 py-1 border rounded text-sm" required />
          </div>

          {/* Photo controls */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file || !isImage(file)) return
              try {
                const blob = await fileToJpegBlob(file)
                setDeletePhoto(false)
                if (pendingUrl) URL.revokeObjectURL(pendingUrl)
                setPendingBlob(blob)
                setPendingUrl(URL.createObjectURL(blob))
              } catch { alert('Failed to process image') }
            }} />
          <div className="flex items-center gap-2">
            {hasPending
              ? <>
                  <img src={pendingUrl!} alt="Preview" className="h-12 w-12 object-cover rounded border" />
                  <span className="text-xs text-gray-500">{blobSize(pendingBlob!)}</span>
                  <button type="button" onClick={() => {
                    if (pendingUrl) URL.revokeObjectURL(pendingUrl)
                    setPendingBlob(null); setPendingUrl(null)
                    if (fileRef.current) fileRef.current.value = ''
                  }} className="text-xs text-red-500 hover:text-red-700">Cancel</button>
                </>
              : <button type="button" onClick={() => fileRef.current?.click()}
                className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-2 py-1">📷 Add/Replace</button>
            }
            {!deletePhoto && homesite.photo !== undefined && (
              <button type="button" onClick={() => {
                if (pendingUrl) URL.revokeObjectURL(pendingUrl)
                setPendingBlob(null); setPendingUrl(null)
                setDeletePhoto(true)
              }} className="text-xs text-gray-400 hover:text-red-500">Remove photo</button>
            )}
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 disabled:bg-gray-400">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={cancelEdit}
              className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}