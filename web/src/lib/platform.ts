// Where the app is running: a browser tab, or the Tauri shell on Windows, macOS or iOS.

/** True inside the native CalmList app. */
export const isNative = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** The hosted web app, used for links that must work outside this device (emails, shared task links). */
export const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL as string | undefined) || 'https://calmlist-steel.vercel.app/app/'

/** This app's shareable address without a route: the page itself in a browser, the hosted app in the native shell. */
export const publicAppUrl = () => (isNative ? WEB_APP_URL : `${location.origin}${location.pathname}`)

/** Opens a web link in the system browser. Native webviews don't open new windows on their own. */
export async function openExternal(url: string) {
  if (!isNative) return void window.open(url, '_blank', 'noopener')
  const { openUrl } = await import('@tauri-apps/plugin-opener')
  await openUrl(url)
}

/** In the native app, every link to another site opens in the system browser. */
export function routeExternalLinks() {
  if (!isNative) return
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a || !/^(https?|mailto):/i.test(a.href) || new URL(a.href).origin === location.origin) return
    e.preventDefault()
    void openExternal(a.href)
  })
}
