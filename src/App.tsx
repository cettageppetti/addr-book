import { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './components/Login'
import Home from './pages/Home'

function App() {
  const [user, setUser] = useState(() => {
    try {
      const item = window.localStorage.getItem('user')
      return item ? JSON.parse(item) : null
    } catch {
      return null
    }
  })

  const [homesites, setHomesites] = useState(null)

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        setUser(data)
      }
    } catch (err) {
      // No session, user is logged out
    }
  }

  const handleLogin = (userData) => {
    setUser(userData)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        
        <Route
          path="/"
          element={
            <Layout user={user} setUser={setUser}>
              <Home user={user} homesites={homesites} />
            </Layout>
          }
        />

        <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
