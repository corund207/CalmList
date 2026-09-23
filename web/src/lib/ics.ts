import type { Data, Recurrence, Task } from './types'

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** RFC 5545 lines are folded at 75 characters with a leading space on continuations. */
const fold = (line: string) => line.match(/.{1,74}/gu)?.join('\r\n ') ?? line

export const rrule = (r: Recurrence) => {
  const freq = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }[r.unit]
  const byDay = r.weekdays?.length ? `;BYDAY=${[...r.weekdays].sort().map((d) => DAYS[d]).join(',')}` : ''
  return `RRULE:FREQ=${freq};INTERVAL=${r.every}${byDay}`
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

const event = (t: Task, data: Data, now: Date) => {
  const due = t.due!
  const date = due.date.replace(/-/g, '')
  const project = data.projects[t.projectId]
  const lines = [
    'BEGIN:VEVENT',
    `UID:${t.id}@calmlist`,
    `DTSTAMP:${stamp(now)}`,
    due.time ? `DTSTART:${date}T${due.time.replace(':', '')}00` : `DTSTART;VALUE=DATE:${date}`,
    due.time ? 'DURATION:PT30M' : 'DURATION:P1D',
    `SUMMARY:${escape(t.content)}`,
    ...(t.description ? [`DESCRIPTION:${escape(t.description)}`] : []),
    ...(project ? [`CATEGORIES:${escape(project.inbox ? 'Inbox' : project.name)}`] : []),
    `PRIORITY:${[1, 3, 5, 9][t.priority - 1]}`,
    ...(due.recurrence ? [rrule(due.recurrence)] : []),
    'END:VEVENT',
  ]
  return lines.map(fold).join('\r\n')
}

/** An iCalendar file of every open, dated task, for Google Calendar, Apple Calendar or Outlook. */
export const toICS = (data: Data, now = new Date()) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CalmList//Tasks//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:CalmList',
    ...Object.values(data.tasks)
      .filter((t) => !t.completed && t.due && data.projects[t.projectId] && !data.projects[t.projectId].archived)
      .map((t) => event(t, data, now)),
    'END:VCALENDAR',
    '',
  ].join('\r\n')
