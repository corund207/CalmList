import { useEffect, useLayoutEffect, useState } from 'react'
import { usePrefs } from '../store/prefs'
import { paletteOf, themeById, toVars, type Theme } from './themes'

export const THEME_CACHE = 'calmlist:theme-cache'

// Earlier versions stored plain "dark" / "light".
const LEGACY: Record<string, string> = { dark: 'calm-dark', light: 'calm-light' }

const prefersLight = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches

export const resolveThemeId = (theme: string, light: string, dark: string, systemLight = prefersLight()) =>
  theme === 'system' ? (systemLight ? light : dark) : (LEGACY[theme] ?? theme)

/** Writes a theme's variables onto <html> and caches them so the next load paints correctly before React runs. */
export const applyTheme = (theme: Theme, accent: string | null, now = new Date()) => {
  const palette = paletteOf(theme, now)
  const glass = !!theme.backdrop && theme.backdrop !== 'scanlines'
  const vars = toVars(palette, accent, theme.font, glass)
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  root.dataset.theme = palette.scheme
  root.dataset.themeId = theme.id
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.bg)
  try {
    localStorage.setItem(THEME_CACHE, JSON.stringify({ scheme: palette.scheme, id: theme.id, vars }))
  } catch {
    /* private mode: the default tokens will show for a frame next time */
  }
}

/** Keeps the page themed as preferences, the OS scheme and (for dynamic themes) the clock change. */
export const useTheme = () => {
  const { theme, themeLight, themeDark, accent } = usePrefs()
  const [systemLight, setSystemLight] = useState(prefersLight)
  const [tick, setTick] = useState(0)
  const active = themeById(resolveThemeId(theme, themeLight, themeDark, systemLight))

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)')
    const on = () => setSystemLight(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    if (typeof active.palette !== 'function') return
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [active])

  // Layout effect: variables must land before child effects (canvas backdrops) read them.
  useLayoutEffect(() => applyTheme(active, accent), [active, accent, tick])
  return active
}
