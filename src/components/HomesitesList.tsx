import { useState } from 'react'
import { Link } from 'react-router'

export default function HomesitesList({ homesites }) {
  const [search, setSearch] = useState('')
  
  const filtered = homesites?.filter(h =>
    h.street_number?.toLowerCase().includes(search.toLowerCase()) ||
    h.street_name?.toLowerCase().includes(search.toLowerCase())
  ) || []

  return (
    <div>
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by street number or name..."
          className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(homesite => (
          <Link
            key={homesite.id}
            to={`/residents/${homesite.id}`}
            className="block bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <h3 className="text-xl font-semibold text-gray-900">
              {homesite.street_number} {homesite.street_name}
            </h3>
            <p className="text-gray-600 mt-2">
              {homesite.zip_code || '28226'}
            </p>
            <div className="mt-4">
              {homesite.residents?.length || 1} resident(s)
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No homesites found.</p>
        </div>
      )}
    </div>
  )
}
