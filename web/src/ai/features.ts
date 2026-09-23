import { toISO, WEEKDAYS } from '../lib/dates'
import { validateFilter } from '../lib/filter'
import { parseDate, parseQuickAdd } from '../lib/parse'
import type { Due, Priority } from '../lib/types'
import { AiError, generateJson, type EngineContext } from './engine'

/** A task proposed by Ramble, reviewed by the person before anything is added. */
export interface Draft {
  content: string
  description: string
  due: Due | null
  dueText: string
  priority: Priority
  project: string | null
  labels: string[]
}

export interface Workspace {
  projects: string[]
  labels: string[]
  now?: Date
}

const today = (now: Date) => `${WEEKDAYS[now.getDay()]}, ${toISO(now)}`

/* ─── Ramble without a model ────────────────────────────────────────────── */

const FILLER = /^(?:(?:and|also|then|so|oh|um+|uh+|okay|ok|right|plus)[,\s]+)*(?:i\s+(?:need|have|want|got|gotta|should|must)\s+to\s+|i(?:'ve| have) got to\s+|i\s+gotta\s+|remember\s+to\s+|don'?t\s+forget\s+to\s+|make\s+sure\s+(?:to|i)\s+|remind\s+me\s+to\s+|i\s+should\s+|i\s+must\s+|need\s+to\s+|gotta\s+|let'?s\s+)?/i

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Splits a brain dump into tasks with the Quick Add parser: sentences, "and then", "also", new lines. */
export const rambleWithRules = (text: string, ws: Workspace): Draft[] =>
  text
    .split(/(?:[.!?;\n]+|\s+(?:and then|and also|also|then|after that|plus)\s+|,\s*(?=(?:i\s+(?:need|have|want|should)|remember|don'?t forget|call|email|buy|book|pay|send|finish|write|pick up)\b))/i)
    .map((s) => s.trim().replace(FILLER, '').trim())
    .filter((s) => s.split(/\s+/).length >= 2 || /\w{4,}/.test(s))
    .map((s) => {
      const p = parseQuickAdd(s, { projects: ws.projects, labels: ws.labels, now: ws.now })
      const dateText = p.tokens.filter((t) => t.type === 'date').map((t) => t.value).join(' ')
      return {
        content: capitalize(p.content.replace(/^[\s,;:-]+|[\s,;:-]+$/g, '').replace(/^(?:to|by|on)\s+/i, '').replace(/\s+(?:by|on|at)$/i, '')),
        description: '',
        due: p.due,
        dueText: dateText,
        priority: p.priority ?? 4,
        project: p.project,
        labels: p.labels,
      }
    })
    .filter((d) => d.content.length > 1)

/* ─── Ramble with a model ───────────────────────────────────────────────── */

const RAMBLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tasks'],
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'when', 'priority', 'project', 'labels', 'notes'],
        properties: {
          title: { type: 'string', description: 'Short imperative task name, no date words' },
          when: { type: 'string', description: 'Date/time phrase exactly as spoken, e.g. "tomorrow at 3pm", "every monday", or ""' },
          priority: { type: 'integer', enum: [1, 2, 3, 4], description: '1 urgent, 4 normal' },
          project: { type: 'string', description: 'One of the listed projects, or ""' },
          labels: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string', description: 'Extra detail worth keeping, or ""' },
        },
      },
    },
  },
}

const rambleSystem = (ws: Workspace, now: Date) => `You turn a spoken or typed brain dump into a clean to-do list.
Today is ${today(now)}.
Rules:
- One task per distinct action. Merge repeats. Ignore filler, greetings and thinking out loud.
- Titles are short and start with a verb ("Call the dentist", "Buy milk"). Keep names, numbers and places.
- Put any timing in "when", copied from the speaker's words ("next friday at 10", "every weekday"). Never invent dates.
- Priority 1 only for words like urgent, asap, critical; 2 for important; otherwise 4.
- Project must be one of: ${ws.projects.length ? ws.projects.map((p) => `"${p}"`).join(', ') : '(none)'}; use "" if none clearly fits.
- Labels only from: ${ws.labels.length ? ws.labels.map((l) => `"${l}"`).join(', ') : '(none)'}.`

interface RambleReply {
  tasks: { title: string; when: string; priority: number; project: string; labels: string[]; notes: string }[]
}

export async function ramble(text: string, ws: Workspace, ctx: EngineContext): Promise<Draft[]> {
  if (!text.trim()) return []
  if (ctx.config.provider === 'rules') return rambleWithRules(text, ws)
  const now = ws.now ?? new Date()
  const reply = await generateJson<RambleReply>({ name: 'ramble', system: rambleSystem(ws, now), prompt: text, schema: RAMBLE_SCHEMA }, ctx)
  const known = (list: string[], v: string) => list.find((x) => x.toLowerCase() === v.trim().toLowerCase()) ?? null
  return (reply.tasks ?? [])
    .filter((t) => t.title?.trim())
    .map((t) => ({
      content: capitalize(t.title.trim()),
      description: t.notes?.trim() ?? '',
      // Dates are resolved by our own parser, so the model never does calendar arithmetic.
      due: t.when?.trim() ? (parseDate(t.when, now)?.due ?? null) : null,
      dueText: t.when?.trim() ?? '',
      priority: ([1, 2, 3, 4].includes(t.priority) ? t.priority : 4) as Priority,
      project: t.project ? known(ws.projects, t.project) : null,
      labels: (t.labels ?? []).map((l) => known(ws.labels, l)).filter(Boolean) as string[],
    }))
}

/* ─── Task Assist ───────────────────────────────────────────────────────── */

export type AssistMode = 'breakdown' | 'actionable' | 'tips'

export const ASSIST_LABELS: Record<AssistMode, string> = {
  breakdown: 'Break it down',
  actionable: 'Make it actionable',
  tips: 'Give me tips',
}

const ASSIST: Record<AssistMode, { schema: object; ask: string }> = {
  breakdown: {
    ask: 'Break this task into 3 to 7 concrete sub-tasks in the order they would be done. Each is a short imperative step.',
    schema: { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: { type: 'string' } } } },
  },
  actionable: {
    ask: 'Rewrite the task name so it is specific and starts with a verb, keeping its meaning. Offer up to 3 alternatives, best first.',
    schema: { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: { type: 'string' } } } },
  },
  tips: {
    ask: 'Give 3 to 5 short, practical tips for getting this task done well. No preamble.',
    schema: { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: { type: 'string' } } } },
  },
}

export async function assist(mode: AssistMode, task: { content: string; description: string }, ctx: EngineContext): Promise<string[]> {
  const { ask, schema } = ASSIST[mode]
  const reply = await generateJson<{ items: string[] }>(
    {
      name: `assist_${mode}`,
      system: 'You help people plan tasks in a to-do app. Be concise and concrete. Reply only with the requested JSON.',
      prompt: `${ask}\n\nTask: ${task.content}${task.description ? `\nNotes: ${task.description}` : ''}`,
      schema: schema as Record<string, unknown>,
    },
    ctx,
  )
  const items = (reply.items ?? []).map((s) => s.trim()).filter(Boolean)
  if (!items.length) throw new AiError('The model returned nothing useful. Try again.')
  return items
}

/* ─── Filter Assist ─────────────────────────────────────────────────────── */

const FILTER_GUIDE = `CalmList filter syntax:
- Terms: today, tomorrow, overdue, no date, recurring, subtask, no labels, deadline, p1, p2, p3, p4, no priority
- "7 days" = due within the next 7 days; "due before: next week"; "due after: oct 1"; any date like "friday"
- #Project, @label, @label* (prefix), /Section, "search: some words"
- Combine with & (and), | (or), ! (not) and parentheses.
Examples: "(today | overdue) & #Work", "p1 & 7 days", "!no date & @phone", "search: invoice | @finance"`

export async function filterAssist(request: string, ws: Workspace, ctx: EngineContext): Promise<string> {
  const reply = await generateJson<{ query: string }>(
    {
      name: 'filter',
      system: `You translate a request into one CalmList filter query.\n${FILTER_GUIDE}\nProjects: ${ws.projects.join(', ') || '(none)'}. Labels: ${ws.labels.join(', ') || '(none)'}. Today is ${today(ws.now ?? new Date())}.`,
      prompt: request,
      schema: { type: 'object', additionalProperties: false, required: ['query'], properties: { query: { type: 'string' } } },
    },
    ctx,
  )
  const query = reply.query?.trim() ?? ''
  const error = validateFilter(query)
  if (!query || error) throw new AiError(`The model suggested "${query}", which isn't a valid filter (${error ?? 'empty'}). Try rephrasing.`)
  return query
}
