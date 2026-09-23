import type { Due } from './types'

export const DAY = 86_400_000
export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
export const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const fromISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** Adds months, clamping to the month's last day (Jan 31 + 1 month = Feb 28). */
export const addMonths = (d: Date, n: number, anchorDay = d.getDate()) => {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return new Date(first.getFullYear(), first.getMonth(), Math.min(anchorDay, last))
}

export const today = () => toISO(new Date())

/** Whole days from today to an ISO date (negative when past). */
export const daysFromToday = (iso: string, now = new Date()) =>
  Math.round((fromISO(iso).getTime() - startOfDay(now).getTime()) / DAY)

export const isOverdue = (due: Due | null, now = new Date()) => {
  if (!due) return false
  const diff = daysFromToday(due.date, now)
  if (diff < 0) return true
  if (diff > 0 || !due.time) return false
  const [h, m] = due.time.split(':').map(Number)
  return now.getHours() * 60 + now.getMinutes() > h * 60 + m
}

export const formatTime = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return m ? `${hour}:${pad(m)} ${suffix}` : `${hour} ${suffix}`
}

const short = (d: Date, withYear: boolean) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear && { year: 'numeric' }) })

/** Human label: Today, Tomorrow, Yesterday, weekday within a week, else "Oct 3". */
export const formatDate = (iso: string, now = new Date()) => {
  const diff = daysFromToday(iso, now)
  const d = fromISO(iso)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return short(d, d.getFullYear() !== now.getFullYear())
}

export const formatDue = (due: Due, now = new Date()) =>
  due.time ? `${formatDate(due.date, now)} ${formatTime(due.time)}` : formatDate(due.date, now)

/** "Mon 23 Sep" style heading for day groups. */
export const formatDayHeading = (iso: string, now = new Date()) => {
  const d = fromISO(iso)
  const base = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const rel = formatDate(iso, now)
  return ['Today', 'Tomorrow', 'Yesterday'].includes(rel) ? `${base} · ${rel}` : base
}

export const compareDue = (a: Due | null, b: Due | null) => {
  if (!a || !b) return a ? -1 : b ? 1 : 0
  return a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99')
}
