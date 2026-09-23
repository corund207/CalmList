import { useEffect, useState, type RefObject } from 'react'
import { resolveTheme, usePrefs } from './store/prefs'
import { useStore } from './store/store'

export const useData = () => useStore((s) => s.data)

/** Applies the theme preference to <html>, following the OS when set to "system". */
export const useTheme = () => {
  const theme = usePrefs((s) => s.theme)
  useEffect(() => {
    const apply = () => {
      const t = resolveTheme(theme)
      document.documentElement.dataset.theme = t
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#ffffff' : '#000000')
    }
    apply()
    const mq = matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

export const useScrolled = (threshold = 24) => {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const el = document.getElementById('main')
    if (!el) return
    const on = () => setScrolled(el.scrollTop > threshold)
    on()
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  }, [threshold])
  return scrolled
}

export const useClickOutside = (ref: RefObject<HTMLElement | null>, onOutside: () => void, active = true) => {
  useEffect(() => {
    if (!active) return
    const on = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside()
    document.addEventListener('pointerdown', on)
    return () => document.removeEventListener('pointerdown', on)
  }, [ref, onOutside, active])
}

export const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}
