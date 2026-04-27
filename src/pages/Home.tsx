import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import HomesitesList from '../components/HomesitesList'
import ResidentProfile from '../components/ResidentProfile'
import { getAuthHeaders } from '../lib/auth'

export default function Home({ user }) {
  const [homesites, setHomesites] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) fetchHomesites()
  }, [user])

  const fetchHomesites = async () => {
    try {
      const res = await fetch('/api/homesites', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setHomesites(data)
      }
    } finally {
      setLoading(false)
    }
  }

  if (!user) return <Navigate to="/login" replace />
  if (loading) return <div className="text-center py-12">Loading...</div>

  // Admin sees all homesites; resident sees their own profile card
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">All Homesites</h2>
      <HomesitesList homesites={homesites} />
    </div>
  )
}