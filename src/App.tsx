import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './components/Login'
import Home from './pages/Home'
import Settings from './pages/Settings'
import ResidentProfile from './components/ResidentProfile'
import { getAuthHeaders, clearToken } from './lib/auth'

function App() {
  const [user, setUser] = useState(() => {
    try {
      const item = window.localStorage.getItem('user')
      return item ? JSON.parse(item) : null
    } catch {
      return null
    }
  })

  // Check auth status on mount (works even if page was refreshed)
  useEffect(() => {
    const token = window.localStorage.getItem('token')
    if (!token) return  // Not logged in

    const checkAuthStatus = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: getAuthHeaders()
        })
        if (res.ok) {
          const data = await res.json()
          setUser(data)
          // Rehydrate user into localStorage if missing (e.g. after hard refresh where only token exists)
          try { window.localStorage.setItem('user', JSON.stringify({ ...data, resident_id: data.resident_id })) } catch {}
        }
      } catch {
        // No session
      }
    }
    checkAuthStatus()
  }, [])

  const handleLogin = (userData) => {
    setUser(userData)
    window.localStorage.setItem('user', JSON.stringify(userData))
    window.localStorage.setItem('addrtab', 'homesites')
  }

  const handleLogout = () => {
    window.localStorage.removeItem('user')
    window.localStorage.removeItem('addrtab')
    clearToken()
    setUser(null)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login onLogin={handleLogin} />} />

        <Route
          path="/"
          element={
            user ? (
              <Layout user={user} onLogout={handleLogout}>
                <Home user={user} />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/settings"
          element={
            user ? (
              <Layout user={user} onLogout={handleLogout}>
                <Settings user={user} onUserUpdate={(u) => {
                  setUser(u)
                  window.localStorage.setItem('user', JSON.stringify(u))
                }} />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/residents/:id"
          element={
            user ? (
              <Layout user={user} onLogout={handleLogout}>
                <ResidentProfile user={user} />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App