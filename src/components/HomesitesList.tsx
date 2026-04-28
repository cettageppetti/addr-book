import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function HomesitesList({ homesites }) {
  const [search, setSearch] = useState('')

  const filtered = (homesites || []).filter(h =>
    h.street_number?.toLowerCase().includes(search.toLowerCase()) ||
    h.street_name?.toLowerCase().includes(search.toLowerCase())
  )

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
        {filtered.map(homesite => {
          const residents = homesite.residents || []
          return (
            <div
              key={homesite.id}
              className="block bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="text-xl font-semibold text-gray-900">
                {homesite.street_number} {homesite.street_name}
              </h3>
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
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {homesites?.length ? 'No matches found.' : 'No homesites loaded.'}
        </div>
      )}
    </div>
  )
}