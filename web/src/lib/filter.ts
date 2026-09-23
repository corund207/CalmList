import { addDays, daysFromToday, isOverdue, toISO } from './dates'
import { parseDate } from './parse'
import type { Data, Task } from './types'

/**
 * A Todoist-style filter language:
 *   today | overdue | tomorrow | no date | recurring | 7 days | p1..p4 | no labels | subtask
 *   #Project  @label  /Section  search: text  due before: <date>  due after: <date>  <any date phrase>
 * combined with & (and), | or , (or), ! (not) and parentheses.
 */
export type Predicate = (task: Task, data: Data) => boolean

class ParseError extends Error {}

const lower = (s: string) => s.trim().toLowerCase()

const atom = (raw: string, now: Date): Predicate => {
  const q = lower(raw)
  if (!q || q === 'all' || q === 'view all') return () => true
  if (q === 'today') return (t) => !!t.due && daysFromToday(t.due.date, now) === 0
  if (q === 'tomorrow') return (t) => !!t.due && daysFromToday(t.due.date, now) === 1
  if (q === 'overdue' || q === 'od') return (t) => isOverdue(t.due, now)
  if (q === 'no date' || q === 'no due date') return (t) => !t.due
  if (q === 'recurring') return (t) => !!t.due?.recurrence
  if (q === 'no labels') return (t) => t.labels.length === 0
  if (q === 'subtask') return (t) => !!t.parentId
  if (q === 'no priority') return (t) => t.priority === 4
  if (q === 'deadline') return (t) => !!t.deadline

  let m = /^p([1-4])$/.exec(q)
  if (m) return (t) => t.priority === Number(m![1])

  m = /^(?:next\s+)?(\d+)\s+days?$/.exec(q)
  if (m) {
    const n = Number(m[1])
    return (t) => !!t.due && daysFromToday(t.due.date, now) >= 0 && daysFromToday(t.due.date, now) < n
  }

  if (q.startsWith('#')) {
    const name = q.replace(/^#+/, '')
    return (t, d) => lower(d.projects[t.projectId]?.name ?? '') === name
  }
  if (q.startsWith('@')) {
    const name = q.slice(1)
    if (name.endsWith('*')) return (t, d) => t.labels.some((l) => lower(d.labels[l]?.name ?? '').startsWith(name.slice(0, -1)))
    return (t, d) => t.labels.some((l) => lower(d.labels[l]?.name ?? '') === name)
  }
  if (q.startsWith('/')) {
    const name = q.slice(1)
    return (t, d) => !!t.sectionId && lower(d.sections[t.sectionId]?.name ?? '') === name
  }
  if (q.startsWith('search:')) {
    const text = q.slice(7).trim()
    return (t) => lower(t.content).includes(text) || lower(t.description).includes(text)
  }

  m = /^due (before|after):\s*(.+)$/.exec(q)
  if (m) {
    const date = parseDate(m[2], now)?.due.date
    if (!date) throw new ParseError(`Unknown date "${m[2]}"`)
    return m[1] === 'before' ? (t) => !!t.due && t.due.date < date : (t) => !!t.due && t.due.date > date
  }

  const date = parseDate(q.replace(/^(date|due):\s*/, ''), now)
  if (date) return (t) => t.due?.date === date.due.date
  throw new ParseError(`Unknown filter "${raw.trim()}"`)
}

/** Recursive descent over | , & ! ( ). */
export const compileFilter = (query: string, now = new Date()): Predicate => {
  const tokens = query.match(/[()&|,!]|[^()&|,!]+/g)?.filter((t) => t.trim()) ?? []
  let i = 0
  const peek = () => tokens[i]?.trim()

  const or = (): Predicate => {
    const parts = [and()]
    while (peek() === '|' || peek() === ',') {
      i++
      parts.push(and())
    }
    return parts.length === 1 ? parts[0] : (t, d) => parts.some((p) => p(t, d))
  }
  const and = (): Predicate => {
    const parts = [unary()]
    while (peek() === '&') {
      i++
      parts.push(unary())
    }
    return parts.length === 1 ? parts[0] : (t, d) => parts.every((p) => p(t, d))
  }
  const unary = (): Predicate => {
    const tok = peek()
    if (tok === '!') {
      i++
      const inner = unary()
      return (t, d) => !inner(t, d)
    }
    if (tok === '(') {
      i++
      const inner = or()
      if (peek() !== ')') throw new ParseError('Missing )')
      i++
      return inner
    }
    if (tok === undefined || '&|,)'.includes(tok)) throw new ParseError('Incomplete filter')
    i++
    return atom(tok, now)
  }

  if (!tokens.length) return () => true
  const pred = or()
  if (i < tokens.length) throw new ParseError(`Unexpected "${tokens[i]}"`)
  return pred
}

export const validateFilter = (query: string): string | null => {
  try {
    compileFilter(query)
    return null
  } catch (e) {
    return (e as Error).message
  }
}

export const runFilter = (query: string, data: Data, now = new Date()) => {
  const pred = compileFilter(query, now)
  return Object.values(data.tasks).filter((t) => !t.completed && data.projects[t.projectId] && pred(t, data))
}

export const nextDays = (n: number, now = new Date()) => Array.from({ length: n }, (_, i) => toISO(addDays(now, i)))
