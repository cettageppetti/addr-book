// Authentication is carried by an httpOnly session cookie that the API sets at
// login. The browser attaches it automatically on same-origin requests, so the
// client never holds the token. Logging out must hit the API to clear it, since
// JavaScript cannot delete an httpOnly cookie.
export async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } catch {
    // Network failure — the caller clears local UI state regardless.
  }
}