export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme'
const TRANSITION_MS = 380
const root = () => document.documentElement

export const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark'

export function explicitTheme(): Theme | null {
  const value = root().getAttribute('data-theme')
  return isTheme(value) ? value : null
}

export function currentTheme(): Theme {
  return explicitTheme() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
}

export function applyTheme(theme: Theme | null, persist = true): void {
  if (theme) root().setAttribute('data-theme', theme)
  else root().removeAttribute('data-theme')
  if (!persist) return
  try {
    if (theme) localStorage.setItem(THEME_STORAGE_KEY, theme)
    else localStorage.removeItem(THEME_STORAGE_KEY)
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

let transitionTimer = 0
export function stampThemeTransition(): void {
  window.clearTimeout(transitionTimer)
  root().dataset.themeTransition = 'true'
  transitionTimer = window.setTimeout(() => delete root().dataset.themeTransition, TRANSITION_MS)
}
