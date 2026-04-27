export function getToken() {
  return window.localStorage.getItem('token')
}

export function setToken(token) {
  window.localStorage.setItem('token', token)
}

export function clearToken() {
  window.localStorage.removeItem('token')
}

export function getAuthHeaders() {
  const token = getToken()
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}