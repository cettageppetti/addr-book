import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import HomesitesList from '../components/HomesitesList'
import ResidentProfile from '../components/ResidentProfile'

export default function Home({ user }) {
  const [homesites, setHomesites] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      fetchHomesites()
    }
  }, [user])

  const fetchHomesites = async () => {
    try {
      const res = await fetch('/api/homesites')
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

  if (user.role === 'resident') {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          My Profile
        </h2>
        <ResidentProfile user={user} homesites={homesites?.homesites} />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        All Homesites
      </h2>
      <HomesitesList homesites={homesites?.homesites} />
    </div>
  )
}
