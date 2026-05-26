// Theme registry + apply helper. A theme is a `data-theme` value on <html>;
// the matching CSS block in index.css swaps the brand/sand/ink variables.
// The choice is an admin setting (site_theme), applied app-wide.

export const THEMES = [
  { id: 'warm',    label: 'Warm Neighborly', accent: '#c2663c' },
  { id: 'garden',  label: 'Fresh Garden',    accent: '#059669' },
  { id: 'civic',   label: 'Clean Civic',     accent: '#2563eb' },
  { id: 'coastal', label: 'Coastal',         accent: '#0891b2' },
  { id: 'dusk',    label: 'Dusk',            accent: '#7c3aed' },
] as const

export type ThemeId = typeof THEMES[number]['id']
export const DEFAULT_THEME: ThemeId = 'warm'

const VALID = new Set<string>(THEMES.map(t => t.id))
const STORAGE_KEY = 'addr_theme'

// Set the active theme on <html> and cache it so the next page load (via the
// inline boot script in index.html) applies it before first paint.
export function applyTheme(id: string | null | undefined): ThemeId {
  const theme = (id && VALID.has(id)) ? (id as ThemeId) : DEFAULT_THEME
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* ignore */ }
  return theme
}
