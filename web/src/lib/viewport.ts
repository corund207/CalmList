// What the phone layout needs from the browser and can't get from CSS. Phone browsers lay the keyboard over the page
// without resizing it, so its height is published as --keyboard for sheets to sit on top of.
import { PHONE } from '../hooks'
import { usePrefs } from '../store/prefs'

export function startViewport() {
  const root = document.documentElement
  const view = window.visualViewport
  const phone = matchMedia(PHONE)

  const measure = () => {
    if (!view) return
    // Pinch-zoom shrinks the visual viewport too, and that isn't a keyboard.
    const covered = view.scale > 1.01 ? 0 : Math.max(0, Math.round(innerHeight - view.height - view.offsetTop))
    root.style.setProperty('--keyboard', `${covered}px`)
  }
  // The sidebar is a drawer here: it never opens by itself, whatever it was left as or the device was rotated from.
  const closeDrawer = () => {
    if (phone.matches && usePrefs.getState().sidebar) usePrefs.getState().set({ sidebar: false })
  }

  measure()
  closeDrawer()
  view?.addEventListener('resize', measure)
  view?.addEventListener('scroll', measure)
  phone.addEventListener('change', closeDrawer)
  return () => {
    view?.removeEventListener('resize', measure)
    view?.removeEventListener('scroll', measure)
    phone.removeEventListener('change', closeDrawer)
  }
}
