import { addDays, addMonths, fromISO, startOfDay, toISO, WEEKDAYS } from './dates'
import type { Due, Recurrence } from './types'

const step = (d: Date, r: Recurrence): Date => {
  if (r.unit === 'day') return addDays(d, r.every)
  if (r.unit === 'month') return addMonths(d, r.every)
  if (r.unit === 'year') return addMonths(d, 12 * r.every)
  if (!r.weekdays?.length) return addDays(d, 7 * r.every)
  // Next listed weekday; wrapping into a new week skips (every - 1) weeks.
  const days = [...r.weekdays].sort()
  const later = days.find((w) => w > d.getDay())
  if (later !== undefined) return addDays(d, later - d.getDay())
  return addDays(d, 7 - d.getDay() + days[0] + 7 * (r.every - 1))
}

/** The due date after completing a recurring task: the first occurrence after the completion day. */
export const nextOccurrence = (due: Due, completedOn = new Date()): Due => {
  const r = due.recurrence!
  const floor = startOfDay(completedOn)
  let next = step(r.fromCompletion ? floor : fromISO(due.date), r)
  while (next <= floor) next = step(next, r)
  return { ...due, date: toISO(next) }
}

const unitLabel = (r: Recurrence) => (r.every === 1 ? r.unit : `${r.every} ${r.unit}s`)

export const describeRecurrence = (r: Recurrence) => {
  const bang = r.fromCompletion ? '!' : ''
  if (r.unit === 'week' && r.weekdays?.length) {
    const sorted = [...r.weekdays].sort()
    if (sorted.join() === '1,2,3,4,5') return `every${bang} weekday`
    const names = sorted.map((w) => WEEKDAYS[w].slice(0, 3)).map((n) => n[0].toUpperCase() + n.slice(1))
    return `every${bang} ${r.every > 1 ? `${r.every} weeks on ` : ''}${names.join(', ')}`
  }
  return `every${bang} ${unitLabel(r)}`
}
