// Reflect the configured community name in the places the OS reads for the
// home-screen / tab label. iOS uses the apple-mobile-web-app-title meta (not the
// manifest name), so we set it client-side from the fetched site_name; the
// Worker-served manifest covers Android/Chrome.
export function applySiteName(name: string | null | undefined) {
  const n = (name || '').trim()
  document.title = n || 'Neighborhood Address Book'
  const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]')
  if (meta) meta.setAttribute('content', n || 'Address Book')
}
