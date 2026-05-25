import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './components/Login'
import Home from './pages/Home'
import Settings from './pages/Settings'
import ResidentProfile from './components/ResidentProfile'
import { logout } from './lib/auth'

function App() {
  const [user, setUser] = useState(() => {
    try {
      const item = window.localStorage.getItem('user')
      return item ? JSON.parse(item) : null
    } catch {
      return null
    }
  })

  // Validate the session cookie on mount (works even after a page refresh).
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const data = await res.json()
          setUser(data)
          try { window.localStorage.setItem('user', JSON.stringify(data)) } catch {}
        } else {
          // Cookie missing or expired — drop stale UI state.
          setUser(null)
          window.localStorage.removeItem('user')
        }
      } catch {
        // Network error — keep any cached user.
      }
    }
    checkAuthStatus()
  }, [])

  const handleLogin = (userData: { id: number; email: string; role: string; resident_id: number | null; token?: string }) => {
    // Persist only display fields — auth itself lives in the httpOnly cookie.
    const info = { id: userData.id, email: userData.email, role: userData.role, resident_id: userData.resident_id }
    setUser(info)
    window.localStorage.setItem('user', JSON.stringify(info))
    window.localStorage.setItem('addrtab', 'homesites')
  }

  const handleLogout = async () => {
    await logout()
    window.localStorage.removeItem('user')
    window.localStorage.removeItem('addrtab')
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