import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './components/Login'
import Home from './pages/Home'
import Settings from './pages/Settings'
import ResidentProfile from './components/ResidentProfile'
import ChangePasswordGate from './components/ChangePasswordGate'
import { logout } from './lib/auth'

// SPA navigations keep the previous scroll position, so opening a resident
// profile from a scrolled-down list would render it at that offset — its top
// hidden under the sticky header. Reset to the top on each route change so a
// new page always starts fully below the header.
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

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

  const handleLogin = (userData: { id: number; email: string; role: string; resident_id: number | null; must_change_password?: number; token?: string }) => {
    // Persist only display fields — auth itself lives in the httpOnly cookie.
    const info = { id: userData.id, email: userData.email, role: userData.role, resident_id: userData.resident_id, must_change_password: userData.must_change_password ?? 0 }
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

  // Block the app until a forced password change is completed.
  if (user && user.must_change_password) {
    return (
      <ChangePasswordGate
        user={user}
        onDone={() => {
          const updated = { ...user, must_change_password: 0 }
          setUser(updated)
          window.localStorage.setItem('user', JSON.stringify(updated))
        }}
      />
    )
  }

  return (
    <BrowserRouter>
      <ScrollToTop />
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