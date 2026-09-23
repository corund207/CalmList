import { addDays, addMonths, MONTHS, startOfDay, toISO, WEEKDAYS } from './dates'
import type { Due, Priority, Recurrence } from './types'

export type TokenType = 'date' | 'priority' | 'project' | 'section' | 'label' | 'deadline'

export interface Token {
  type: TokenType
  start: number
  end: number
  value: string
}

export interface Parsed {
  content: string
  due: Due | null
  deadline: string | null
  priority: Priority | null
  project: string | null
  section: string | null
  labels: string[]
  tokens: Token[]
}

interface Span {
  start: number
  end: number
}

/* ─── Date phrases ─────────────────────────────────────────────────────────── */

const WD = '(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|sday|nesday|rsday|urday)?'
const WD_FULL = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday)'
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*'
const ORD = '(?:st|nd|rd|th)?'
const TIME_RE = /(?:\bat\s+)?\b(?:(noon|midnight)|(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b|(\d{1,2}):(\d{2})\b)/gi
const AT_HOUR_RE = /\bat\s+(\d{1,2})\b(?!\s*(?:am|pm|[:/]))/gi

const weekday = (name: string) => WEEKDAYS.findIndex((w) => w.startsWith(name.slice(0, 3).toLowerCase()))
const month = (name: string) => MONTHS.findIndex((m) => m.startsWith(name.slice(0, 3).toLowerCase()))

const nextWeekday = (from: Date, day: number) => addDays(from, ((day - from.getDay() + 7) % 7) || 7)

/** A month/day with no year means the next time that date comes round. */
const upcoming = (now: Date, m: number, d: number, y?: string) => {
  if (y) return new Date(Number(y.length === 2 ? `20${y}` : y), m, d)
  const date = new Date(now.getFullYear(), m, d)
  return date < startOfDay(now) ? new Date(now.getFullYear() + 1, m, d) : date
}

type DateRule = [RegExp, (m: RegExpExecArray, now: Date) => Date | null]

const DATE_RULES: DateRule[] = [
  [/\b(today|tonight)\b/i, (_, n) => startOfDay(n)],
  [/\b(tomorrow|tmrw?)\b/i, (_, n) => addDays(n, 1)],
  [/\byesterday\b/i, (_, n) => addDays(n, -1)],
  [/\bnext\s+week\b/i, (_, n) => nextWeekday(n, 1)],
  [/\bnext\s+month\b/i, (_, n) => new Date(n.getFullYear(), n.getMonth() + 1, 1)],
  [/\bnext\s+year\b/i, (_, n) => new Date(n.getFullYear() + 1, 0, 1)],
  [/\b(this\s+)?weekend\b/i, (_, n) => (n.getDay() === 6 ? startOfDay(n) : nextWeekday(n, 6))],
  [/\bin\s+(\d+|a|an|one|two|three)\s+(day|week|month|year)s?\b/i, (m, n) => {
    const k = ({ a: 1, an: 1, one: 1, two: 2, three: 3 } as Record<string, number>)[m[1].toLowerCase()] ?? Number(m[1])
    const unit = m[2].toLowerCase()
    return unit === 'day' ? addDays(n, k) : unit === 'week' ? addDays(n, 7 * k) : addMonths(n, unit === 'month' ? k : 12 * k)
  }],
  // Bare weekdays must be spelled out ("sun cream" is not a date); "on sun" / "next sun" may abbreviate.
  [new RegExp(`\\b(?:next\\s+|on\\s+)?${WD_FULL}\\b`, 'i'), (m, n) => nextWeekday(n, weekday(m[1]))],
  [new RegExp(`\\b(?:next|on)\\s+${WD}\\b`, 'i'), (m, n) => nextWeekday(n, weekday(m[1]))],
  [/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => new Date(+m[1], +m[2] - 1, +m[3])],
  [/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/, (m, n) => upcoming(n, +m[1] - 1, +m[2], m[3])],
  [new RegExp(`\\b${MON}\\s+(\\d{1,2})${ORD}(?:,?\\s+(\\d{4}))?\\b`, 'i'), (m, n) => upcoming(n, month(m[1]), +m[2], m[3])],
  [new RegExp(`\\b(\\d{1,2})${ORD}\\s+(?:of\\s+)?${MON}(?:\\s+(\\d{4}))?\\b`, 'i'), (m, n) => upcoming(n, month(m[2]), +m[1], m[3])],
]

const RECURRENCE_RE = new RegExp(
  `\\b(?:every(!)?\\s+(?:(other|\\d+)\\s+)?(day|week|month|year|weekday|workday|${WD}(?:\\s*(?:,|and)\\s*${WD})*)s?|(daily|weekly|monthly|yearly|annually))\\b`,
  'i',
)

const parseRecurrence = (m: RegExpExecArray): Recurrence | null => {
  if (m[m.length - 1]) {
    const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year', annually: 'year' }[m[m.length - 1].toLowerCase()]
    return { every: 1, unit: unit as Recurrence['unit'] }
  }
  const every = m[2] ? (m[2].toLowerCase() === 'other' ? 2 : Math.max(1, Number(m[2]))) : 1
  const what = m[3].toLowerCase()
  const fromCompletion = m[1] === '!' || undefined
  if (what === 'weekday' || what === 'workday') return { every: 1, unit: 'week', weekdays: [1, 2, 3, 4, 5], fromCompletion }
  if (['day', 'week', 'month', 'year'].includes(what)) return { every, unit: what as Recurrence['unit'], fromCompletion }
  const days = [...new Set(what.split(/\s*(?:,|and)\s*/).map(weekday).filter((d) => d >= 0))]
  return { every, unit: 'week', weekdays: days, fromCompletion }
}

const firstDay = (r: Recurrence, now: Date) => {
  if (!r.weekdays?.length) return startOfDay(now)
  return r.weekdays.includes(now.getDay()) ? startOfDay(now) : nextWeekday(now, [...r.weekdays].sort((a, b) => ((a - now.getDay() + 7) % 7) - ((b - now.getDay() + 7) % 7))[0])
}

const toTime = (m: RegExpExecArray) => {
  if (m[1]) return m[1].toLowerCase() === 'noon' ? '12:00' : '00:00'
  let h: number
  let min: number
  if (m[2]) {
    h = Number(m[2]) % 12
    min = Number(m[3] ?? 0)
    if (m[4].toLowerCase() === 'pm') h += 12
  } else {
    h = Number(m[5])
    min = Number(m[6])
  }
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** "at 5" reads as 5 PM; "at 9" as 9 AM; "at 17" as 17:00. */
const atHour = (h: number) => (h > 23 ? null : `${String(h >= 1 && h <= 7 ? h + 12 : h).padStart(2, '0')}:00`)

const findTime = (text: string, near?: Span) => {
  const found: (Span & { time: string })[] = []
  for (const re of [TIME_RE, AT_HOUR_RE]) {
    re.lastIndex = 0
    for (let m; (m = re.exec(text)); ) {
      const time = re === AT_HOUR_RE ? atHour(Number(m[1])) : toTime(m)
      if (time) found.push({ start: m.index, end: m.index + m[0].length, time })
    }
  }
  if (!found.length) return null
  // Prefer a time touching the date phrase ("tomorrow at 5pm", "5pm friday").
  const gap = (s: Span) => (near ? Math.min(Math.abs(s.start - near.end), Math.abs(near.start - s.end)) : s.start)
  return found.sort((a, b) => gap(a) - gap(b))[0]
}

export interface DateMatch {
  spans: Span[]
  due: Due
}

/** Finds a date phrase anywhere in the text: "tomorrow 5pm", "every mon, wed", "jan 5". */
export const parseDate = (text: string, now = new Date()): DateMatch | null => {
  let span: Span | null = null
  let date: Date | null = null
  let recurrence: Recurrence | undefined

  const rec = RECURRENCE_RE.exec(text)
  if (rec) {
    const r = parseRecurrence(rec)
    if (r) {
      recurrence = r
      span = { start: rec.index, end: rec.index + rec[0].length }
      date = firstDay(r, now)
    }
  }

  if (!recurrence) {
    let best: { m: RegExpExecArray; rule: DateRule } | null = null
    for (const rule of DATE_RULES) {
      const m = rule[0].exec(text)
      if (m && (!best || m.index < best.m.index || (m.index === best.m.index && m[0].length > best.m[0].length))) best = { m, rule }
    }
    if (best) {
      const d = best.rule[1](best.m, now)
      if (d && !Number.isNaN(d.getTime())) {
        date = d
        span = { start: best.m.index, end: best.m.index + best.m[0].length }
      }
    }
  }

  const time = findTime(text, span ?? undefined)
  if (!date && !time) return null
  if (!date) {
    // A bare time means today, or tomorrow if it has already passed.
    const [h, m] = time!.time.split(':').map(Number)
    date = h * 60 + m <= now.getHours() * 60 + now.getMinutes() ? addDays(now, 1) : startOfDay(now)
  }

  const spans = ([span, time].filter(Boolean) as Span[]).map(({ start, end }) => ({ start, end })).sort((a, b) => a.start - b.start)
  const due: Due = { date: toISO(date), ...(time && { time: time.time }), ...(recurrence && { recurrence }) }
  return { spans, due }
}

/* ─── Quick add ────────────────────────────────────────────────────────────── */

/** Longest known name that the text after a sigil starts with; else one word. */
const matchName = (rest: string, known: string[]) => {
  const lower = rest.toLowerCase()
  const hit = known
    .filter((n) => lower.startsWith(n.toLowerCase()) && !/[\w-]/.test(rest[n.length] ?? ''))
    .sort((a, b) => b.length - a.length)[0]
  return hit ?? rest.match(/^[^\s#@/{}]+/)?.[0] ?? ''
}

export interface QuickAddContext {
  projects: string[]
  sections?: string[]
  labels: string[]
  now?: Date
}

export const parseQuickAdd = (input: string, ctx: QuickAddContext): Parsed => {
  const tokens: Token[] = []
  const taken = (s: number, e: number) => tokens.some((t) => s < t.end && e > t.start)
  const out: Parsed = { content: '', due: null, deadline: null, priority: null, project: null, section: null, labels: [], tokens }

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (!'#@/'.includes(ch) || (i > 0 && !/\s/.test(input[i - 1]))) continue
    const known = ch === '#' ? ctx.projects : ch === '@' ? ctx.labels : (ctx.sections ?? [])
    const name = matchName(input.slice(i + 1), known)
    if (!name) continue
    const token: Token = { type: ch === '#' ? 'project' : ch === '@' ? 'label' : 'section', start: i, end: i + 1 + name.length, value: name }
    if (token.type === 'project') out.project = name
    else if (token.type === 'section') out.section = name
    else out.labels.push(name)
    tokens.push(token)
    i = token.end - 1
  }

  for (const m of input.matchAll(/(?:^|\s)(p([1-4]))(?=\s|$)/gi)) {
    const start = m.index! + m[0].indexOf(m[1])
    if (taken(start, start + 2)) continue
    out.priority = Number(m[2]) as Priority
    tokens.push({ type: 'priority', start, end: start + 2, value: m[1].toLowerCase() })
  }

  const deadline = /\{([^}]+)\}/.exec(input)
  if (deadline && !taken(deadline.index, deadline.index + deadline[0].length)) {
    const d = parseDate(deadline[1], ctx.now)
    if (d) {
      out.deadline = d.due.date
      tokens.push({ type: 'deadline', start: deadline.index, end: deadline.index + deadline[0].length, value: d.due.date })
    }
  }

  // Dates are searched in the text with other tokens blanked out, so "#Monday" is never a date.
  const masked = tokens.reduce((s, t) => s.slice(0, t.start) + ' '.repeat(t.end - t.start) + s.slice(t.end), input)
  const date = parseDate(masked, ctx.now)
  if (date) {
    out.due = date.due
    // "tomorrow at 5pm" reads as one token; a time elsewhere in the title stays separate.
    const [a, b] = date.spans
    const spans = b && !/\S/.test(input.slice(a.end, b.start)) ? [{ start: a.start, end: b.end }] : date.spans
    for (const { start, end } of spans) tokens.push({ type: 'date', start, end, value: input.slice(start, end) })
  }

  tokens.sort((a, b) => a.start - b.start)
  out.content = tokens
    .reduceRight((s, t) => s.slice(0, t.start) + s.slice(t.end), input)
    .replace(/\s+/g, ' ')
    .trim()
  return out
}
