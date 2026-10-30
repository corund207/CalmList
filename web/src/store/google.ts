// Google Calendar through the CalmList server, which keeps it in sync with every app closed: the
// CalmList calendar both ways, plus events from the person's other calendars to pick from.
// Used when the account syncs through a CalmList server; other setups use the browser-only store/gcal.ts.
import { create } from 'zustand'
import { loadGis } from './gcal'
import { usePrefs } from './prefs'
import { call, PRESETS } from './providers'

const SCOPES = 'openid email https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/calendar.readonly'

export interface PickableEvent {
  key: string
  calendarId: string
  calendar: string
  color: string | null
  title: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  allDay: boolean
  link: string | null
  taskId: string | null
  dismissed: boolean
}

interface Status {
  available: boolean
  connected: boolean
  email?: string
  lastSync?: number | null
  error?: string | null
}

interface GoogleState {
  /** Whether this account's server can sync Google Calendar; null until asked. */
  available: boolean | null
  connected: boolean
  email: string
  lastSync: number | null
  error: string | null
  busy: boolean
  /** Every event fetched so far, by key, from whichever ranges were shown. */
  events: Record<string, PickableEvent>
  /** Bumped when Google reports a change, so open views fetch their range again. */
  version: number
  loadingEvents: boolean
  eventsError: string | null
}

export const useGoogle = create<GoogleState>()(() => ({
  available: null,
  connected: false,
  email: '',
  lastSync: null,
  error: null,
  busy: false,
  events: {},
  version: 0,
  loadingEvents: false,
  eventsError: null,
}))

/** The signed-in CalmList server, if the account syncs through one. */
const server = () => {
  const { provider, session } = usePrefs.getState()
  return provider.kind === 'calmlist' && session ? { url: provider.url, token: session.token } : null
}

const api = <T,>(path: string, init: RequestInit = {}) => {
  const s = server()
  if (!s) throw new Error('Google Calendar sync needs an account on a CalmList server.')
  return call<T>(s.url, path, { ...init, token: s.token })
}
const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body: JSON.stringify(body) })

/** True when this account can use the server's Google Calendar sync. */
export const usesServerCalendar = () => !!server() && useGoogle.getState().available !== false

const apply = (s: Partial<Status>) =>
  useGoogle.setState({
    ...(s.available !== undefined && { available: s.available }),
    connected: !!s.connected,
    email: s.email ?? '',
    lastSync: s.lastSync ?? null,
    error: s.error ?? null,
  })

export async function refreshGoogle() {
  if (!server()) return void useGoogle.setState({ available: false })
  apply(await api<Status>('/api/google'))
}

const busy = async <T,>(fn: () => Promise<T>) => {
  useGoogle.setState({ busy: true })
  try {
    return await fn()
  } finally {
    useGoogle.setState({ busy: false })
  }
}

/** Google's consent popup, then the server takes over: it keeps a lasting sign-in and syncs from then on. */
export const connectGoogle = () =>
  busy(async () => {
    if (!PRESETS.googleClientId) throw new Error('This copy of CalmList has no Google client id (VITE_GOOGLE_CLIENT_ID).')
    const google = await loadGis()
    const code = await new Promise<string>((resolve, reject) =>
      google.accounts.oauth2
        .initCodeClient({
          client_id: PRESETS.googleClientId,
          scope: SCOPES,
          ux_mode: 'popup',
          select_account: true,
          callback: (r) => (r.code ? resolve(r.code) : reject(new Error(r.error === 'access_denied' ? 'Calendar access was not granted.' : `Google sign-in failed (${r.error}).`))),
          error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Google sign-in was closed.' : `Google sign-in failed (${e.type}).`)),
        })
        .requestCode(),
    )
    apply(await post<Status>('/api/google/connect', { code, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }))
    void loadEvents(...nextDays())
  })

export const disconnectGoogle = (deleteCalendar: boolean) =>
  busy(async () => {
    apply(await post<Status>('/api/google/disconnect', { deleteCalendar }))
    useGoogle.setState({ events: {} })
  })

export const syncGoogle = () => busy(async () => apply(await post<Status>('/api/google/sync')))

/** When an event starts, as a time (all-day events at local midnight). */
export const eventStart = (e: PickableEvent) =>
  e.start?.dateTime ? new Date(e.start.dateTime) : new Date(`${e.start?.date ?? '1970-01-01'}T00:00:00`)
export const eventEnd = (e: PickableEvent) =>
  e.end?.dateTime ? new Date(e.end.dateTime) : e.end?.date ? new Date(`${e.end.date}T00:00:00`) : new Date(eventStart(e).getTime() + 3600_000)

/** From the start of today to 30 days on: the window the sidebar counts from. */
export const nextDays = (days = 30): [Date, Date] => {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  return [from, new Date(from.getTime() + days * 86_400_000)]
}

/** Fetches events between two times from the person's other calendars, replacing what was known for that window. */
export async function loadEvents(from: Date, to: Date) {
  if (!useGoogle.getState().connected) return
  useGoogle.setState({ loadingEvents: true })
  try {
    const q = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
    const { events } = await api<{ events: PickableEvent[] }>(`/api/google/events?${q}`)
    useGoogle.setState((s) => {
      const next: Record<string, PickableEvent> = {}
      for (const [k, e] of Object.entries(s.events)) {
        const at = eventStart(e)
        if (at < from || at >= to) next[k] = e
      }
      for (const e of events) next[e.key] = e
      return { events: next, eventsError: null }
    })
  } catch (e) {
    useGoogle.setState({ eventsError: (e as Error).message })
  } finally {
    useGoogle.setState({ loadingEvents: false })
  }
}

const patchEvent = (key: string, patch: Partial<PickableEvent>) =>
  useGoogle.setState((s) => (s.events[key] ? { events: { ...s.events, [key]: { ...s.events[key], ...patch } } } : {}))

/** Adds an event to CalmList as a task (in the Inbox). The task arrives through sync a moment later. */
export async function pickEvent(key: string) {
  const { taskId } = await post<{ taskId: string }>('/api/google/events/add', { key })
  patchEvent(key, { taskId, dismissed: false })
  return taskId
}

export async function dismissEvent(key: string, undo = false) {
  patchEvent(key, { dismissed: !undo })
  await post('/api/google/events/dismiss', { key, undo })
}

/** Keeps status and the event list fresh: on start, when the server says Google changed, and when the app comes back. */
export function startGoogleUpdates() {
  const refresh = () => {
    if (!server()) return
    void refreshGoogle()
      .then(() => loadEvents(...nextDays()))
      .then(() => useGoogle.setState((s) => ({ version: s.version + 1 })))
      .catch(() => {})
  }
  refresh()
  const onVisible = () => document.visibilityState === 'visible' && refresh()
  window.addEventListener('calmlist:google', refresh)
  document.addEventListener('visibilitychange', onVisible)
  const unsubscribe = usePrefs.subscribe((s, prev) => (s.session !== prev.session || s.provider !== prev.provider) && refresh())
  return () => {
    window.removeEventListener('calmlist:google', refresh)
    document.removeEventListener('visibilitychange', onVisible)
    unsubscribe()
  }
}
