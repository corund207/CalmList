// Google Calendar connector. Runs entirely in the browser with Google Identity Services: no server
// and no stored refresh token. The scope (calendar.app.created) only reaches calendars this app
// created, so CalmList can never read or change the person's other calendars.
import { create } from 'zustand'
import { eventId, fingerprint, planSync, type CalendarEvent } from '../lib/gcal'
import { usePrefs } from './prefs'
import { PRESETS } from './providers'
import { useStore } from './store'

const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'
const API = 'https://www.googleapis.com/calendar/v3'
const CALENDAR_NAME = 'CalmList'

interface Saved {
  calendarId: string | null
  /** Task id → fingerprint of what was last sent. */
  synced: Record<string, string>
}

interface GcalState {
  connected: boolean
  /** Connected before, but the one-hour access token ran out; a click reconnects. */
  expired: boolean
  busy: boolean
  lastSync: number | null
  error: string | null
}

export const useGcal = create<GcalState>()(() => ({ connected: false, expired: false, busy: false, lastSync: null, error: null }))

/* ─── Per-account state on this device ──────────────────────────────────── */

const storageKey = () => `calmlist:gcal:${usePrefs.getState().session?.user.id ?? 'local'}`
const load = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(storageKey()) ?? 'null')
  } catch {
    return null
  }
}
const save = (s: Saved) => localStorage.setItem(storageKey(), JSON.stringify(s))

/* ─── Google Identity Services ──────────────────────────────────────────── */

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(c: { client_id: string; scope: string; callback(r: TokenResponse): void; error_callback?(e: { type: string }): void }): {
        requestAccessToken(o?: { prompt?: string }): void
      }
      revoke(token: string, done?: () => void): void
    }
  }
}

let gis: Promise<Gis> | null = null
const loadGis = () =>
  (gis ??= new Promise<Gis>((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true })
    s.onload = () => resolve((window as unknown as { google: Gis }).google)
    s.onerror = () => (gis = null, reject(new Error("Couldn't load Google sign-in. Check your connection or content blocker.")))
    document.head.append(s)
  }))

let token: { value: string; expires: number } | null = null

async function authorize(prompt: '' | 'consent') {
  if (!PRESETS.googleClientId) throw new Error('This copy of CalmList has no Google client id (VITE_GOOGLE_CLIENT_ID).')
  const google = await loadGis()
  const res = await new Promise<TokenResponse>((resolve, reject) => {
    google.accounts.oauth2
      .initTokenClient({
        client_id: PRESETS.googleClientId,
        scope: SCOPE,
        callback: resolve,
        error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Google sign-in was closed.' : `Google sign-in failed (${e.type}).`)),
      })
      .requestAccessToken({ prompt })
  })
  if (!res.access_token) throw new Error(res.error === 'access_denied' ? 'Calendar access was not granted.' : `Google sign-in failed (${res.error}).`)
  token = { value: res.access_token, expires: Date.now() + ((res.expires_in ?? 3600) - 60) * 1000 }
  useGcal.setState({ connected: true, expired: false, error: null })
}

class Expired extends Error {}

async function api<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  if (!token || Date.now() > token.expires) throw new Expired()
  const res = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${token.value}`, 'content-type': 'application/json', ...init.headers } })
  if (res.status === 401) throw new Expired()
  if (res.status === 404 || res.status === 410) return null
  if (res.status === 204) return {} as T
  const body = await res.json().catch(() => ({}))
  if (res.status === 409) throw Object.assign(new Error('conflict'), { status: 409 })
  if (!res.ok) throw new Error(body?.error?.message ?? `Google Calendar responded ${res.status}`)
  return body as T
}

/* ─── Sync ──────────────────────────────────────────────────────────────── */

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const appUrl = () => `${location.origin}${location.pathname}`

/** Finds the CalmList calendar this app made, or makes it. */
async function ensureCalendar(saved: Saved): Promise<string> {
  if (saved.calendarId && (await api(`/calendars/${encodeURIComponent(saved.calendarId)}`))) return saved.calendarId
  const made = await api<{ id: string }>('/calendars', { method: 'POST', body: JSON.stringify({ summary: CALENDAR_NAME, description: 'Tasks with a date from CalmList. Managed by the app; edits here are overwritten.', timeZone: timeZone() }) })
  saved.calendarId = made!.id
  saved.synced = {}
  save(saved)
  return made!.id
}

async function upsert(calendarId: string, event: CalendarEvent) {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`
  const body = JSON.stringify({ ...event, status: 'confirmed' })
  if (await api(`${base}/${event.id}`, { method: 'PUT', body })) return
  try {
    await api(base, { method: 'POST', body })
  } catch (e) {
    // The id was used before and deleted; Google keeps it, so bring it back instead.
    if ((e as { status?: number }).status === 409) await api(`${base}/${event.id}`, { method: 'PUT', body })
    else throw e
  }
}

let running: Promise<void> | null = null
let again = false

/** Sends changed dated tasks to the CalmList calendar and removes finished or undated ones. */
export function syncCalendar(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    const saved = load()
    if (!saved) return
    useGcal.setState({ busy: true })
    try {
      const calendarId = await ensureCalendar(saved)
      const plan = planSync(useStore.getState().data, saved.synced, timeZone(), appUrl())
      for (const event of plan.upsert) {
        await upsert(calendarId, event)
        saved.synced[event.extendedProperties.private.calmlist] = fingerprint(event)
        save(saved)
      }
      for (const taskId of plan.remove) {
        await api(`/calendars/${encodeURIComponent(calendarId)}/events/${eventId(taskId)}`, { method: 'DELETE' })
        delete saved.synced[taskId]
        save(saved)
      }
      useGcal.setState({ lastSync: Date.now(), error: null })
    } catch (e) {
      if (e instanceof Expired) useGcal.setState({ connected: false, expired: true })
      else useGcal.setState({ error: (e as Error).message })
    } finally {
      useGcal.setState({ busy: false })
    }
  })().finally(() => {
    running = null
    if (again) {
      again = false
      void syncCalendar()
    }
  })
  return running
}

/* ─── Public actions ────────────────────────────────────────────────────── */

export async function connectCalendar() {
  await authorize(load() ? '' : 'consent')
  if (!load()) save({ calendarId: null, synced: {} })
  await syncCalendar()
}

export async function disconnectCalendar(deleteCalendar: boolean) {
  const saved = load()
  if (deleteCalendar && saved?.calendarId) {
    if (!token || Date.now() > token.expires) await authorize('')
    await api(`/calendars/${encodeURIComponent(saved.calendarId)}`, { method: 'DELETE' })
  }
  if (token) (await loadGis()).accounts.oauth2.revoke(token.value)
  token = null
  localStorage.removeItem(storageKey())
  useGcal.setState({ connected: false, expired: false, lastSync: null, error: null })
}

export const calendarLinked = () => !!load()

/** Keeps the calendar in step with task changes while the connection is live. */
export function startCalendarAutoSync() {
  if (load()) useGcal.setState({ expired: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  return useStore.subscribe((s, prev) => {
    if (s.data.tasks === prev.data.tasks && s.data.projects === prev.data.projects) return
    if (!useGcal.getState().connected) return
    clearTimeout(timer)
    timer = setTimeout(() => void syncCalendar(), 4000)
  })
}
