import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'

export default function ResidentProfile({ user, homesites }) {
  // Get resident ID from URL params or use user's resident_id
  const { id } = useParams()
  const navigate = useNavigate()
  
  const residentId = id || user.resident_id
  const [resident, setResident] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Check if editing is allowed
  const canEdit = user.role === 'admin' || String(user.resident_id) === residentId

  useEffect(() => {
    const fetchResident = async () => {
      try {
        const res = await fetch(`/api/residents/${residentId}/contacts`)
        if (!res.ok) {
          if (res.status === 403) {
            navigate('/')
            return
          }
          throw new Error('Failed to fetch resident')
        }
        const data = await res.json()
        setResident(data.resident)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchResident()
  }, [id, navigate])

  if (loading) return <div className="text-center py-12">Loading...</div>
  if (error) return <div className="text-red-600 text-center py-12">{error}</div>
  if (!resident) return <div className="text-center py-12">Resident not found</div>

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        {resident.name}'s Profile
      </h2>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Address</h3>
        <p className="text-gray-700">
          {resident.street_number} {resident.street_name}
        </p>
        <p className="text-gray-600">Charlotte, NC {resident.zip_code || '28226'}</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
        
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-2">Phone Numbers</h4>
          {resident.phones?.length > 0 ? (
            <ul className="space-y-2">
              {resident.phones.map(phone => (
                <li key={phone.id} className="flex items-center">
                  <span className="text-gray-700 flex-1">{phone.number}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 italic">No phone numbers on file</p>
          )}
        </div>

        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-2">Email Addresses</h4>
          {resident.emails?.length > 0 ? (
            <ul className="space-y-2">
              {resident.emails.map(email => (
                <li key={email.id} className="flex items-center">
                  <span className="text-gray-700 flex-1">{email.address}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 italic">No email addresses on file</p>
          )}
        </div>

        {canEdit && (
          <ContactEditor residentId={resident.id} />
        )}
      </div>
    </div>
  )
}

function ContactEditor({ residentId }) {
  const [phones, setPhones] = useState([''])
  const [emails, setEmails] = useState([''])
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  const addPhone = () => setPhones([...phones, ''])
  const removePhone = (i) => {
    if (phones.length > 1) setPhones(phones.filter((_, idx) => idx !== i))
  }
  const updatePhone = (i, val) => {
    const newPhones = [...phones]
    newPhones[i] = val
    setPhones(newPhones)
  }

  const addEmail = () => setEmails([...emails, ''])
  const removeEmail = (i) => {
    if (emails.length > 1) setEmails(emails.filter((_, idx) => idx !== i))
  }
  const updateEmail = (i, val) => {
    const newEmails = [...emails]
    newEmails[i] = val
    setEmails(newEmails)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSuccess('')

    try {
      const res = await fetch(`/api/users/${residentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phones: phones.filter(p => p.trim()),
          emails: emails.filter(e => e.trim())
        })
      })

      if (!res.ok) throw new Error('Failed to update')

      setSuccess('Contact information updated successfully!')
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 pt-6 border-t">
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      <h4 className="text-md font-medium text-gray-900 mb-2">Edit Contact</h4>
      
      <div className="mb-4">
        {phones.map((phone, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              type="tel"
              placeholder="(555) 123-4567"
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
              value={phone}
              onChange={(e) => updatePhone(i, e.target.value)}
            />
            {phones.length > 1 && (
              <button
                type="button"
                onClick={() => removePhone(i)}
                className="px-3 py-2 bg-red-100 text-red-600 rounded hover:bg-red-200"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addPhone}
          className="text-sm text-indigo-600 hover:text-indigo-800 mt-2"
        >
          + Add phone
        </button>
      </div>

      <div className="mb-4">
        {emails.map((email, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              type="email"
              placeholder="email@example.com"
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
              value={email}
              onChange={(e) => updateEmail(i, e.target.value)}
            />
            {emails.length > 1 && (
              <button
                type="button"
                onClick={() => removeEmail(i)}
                className="px-3 py-2 bg-red-100 text-red-600 rounded hover:bg-red-200"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addEmail}
          className="text-sm text-indigo-600 hover:text-indigo-800 mt-2"
        >
          + Add email
        </button>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </form>
  )
}
