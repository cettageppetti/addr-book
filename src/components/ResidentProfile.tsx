import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAuthHeaders } from '../lib/auth'

export default function ResidentProfile({ residentId: propResidentId, user }) {
  const urlParams = useParams()
  const residentId = propResidentId || urlParams.id
  const [resident, setResident] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const canEdit = user?.role === 'admin' || String(user?.resident_id) === residentId

  useEffect(() => {
    if (!residentId) return
    const fetchResident = async () => {
      try {
        const res = await fetch(`/api/residents/${residentId}`, { headers: getAuthHeaders() })
        if (!res.ok) {
          if (res.status === 403) { window.location.href = '/'; return }
          throw new Error('Failed to load profile')
        }
        const data = await res.json()
        setResident(data)
      } catch (err) {
        setError(err.message || 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    fetchResident()
  }, [residentId])

  if (loading) return <div className="text-center py-12">Loading...</div>
  if (error) return <div className="text-red-600 text-center py-12">{error}</div>
  if (!resident) return <div className="text-center py-12">Profile not found.</div>

  const phones = resident.phones || []
  const emails = resident.emails || []

  return (
    <div className="max-w-3xl mx-auto">
      {user?.role === 'admin' && (
        <Link to="/" className="text-indigo-600 hover:text-indigo-800 text-sm mb-4 inline-block">
          ← Back to homesites
        </Link>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">{resident.name}</h2>
        <p className="text-gray-600">
          {resident.street_number} {resident.street_name}, Charlotte NC {resident.zip_code || '28226'}
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

        {canEdit && <ContactEditor residentId={resident.id} phones={phones} emails={emails} />}
      </div>
    </div>
  )
}

function ContactEditor({ residentId, phones, emails }) {
  const [phoneVals, setPhoneVals] = useState(phones.map(p => p.number))
  const [emailVals, setEmailVals] = useState(emails.map(e => e.address))
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSuccess('')
    try {
      const res = await fetch(`/api/residents/${residentId}/contacts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          phones: phoneVals.filter(p => p.trim()),
          emails: emailVals.filter(e => e.trim())
        })
      })
      if (!res.ok) throw new Error('Save failed')
      setSuccess('Changes saved successfully!')
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  const updatePhone = (i, val) => setPhoneVals(prev => prev.map((v, idx) => idx === i ? val : v))
  const updateEmail = (i, val) => setEmailVals(prev => prev.map((v, idx) => idx === i ? val : v))
  const addPhone = () => setPhoneVals(prev => [...prev, ''])
  const addEmail = () => setEmailVals(prev => [...prev, ''])

  return (
    <form onSubmit={handleSave} className="mt-6 pt-6 border-t">
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">{success}</div>
      )}

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
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </form>
  )
}