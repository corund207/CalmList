import { parseDate, parseQuickAdd } from './parse'
import type { Due, Priority } from './types'

/** Rows of a CSV file, honouring quoted fields with commas, quotes and newlines. */
export const parseCSV = (text: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') row.push(field), (field = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) rows.push([...row, field])
  return rows.filter((r) => r.some((f) => f.trim()))
}

export interface ImportedTask {
  content: string
  description: string
  priority: Priority
  labels: string[]
  due: Due | null
  section: string | null
  depth: number
  comments: string[]
}

export interface ImportedProject {
  name: string
  sections: string[]
  tasks: ImportedTask[]
}

/**
 * Reads a Todoist project export (Project menu → Export as a template → CSV).
 * Todoist writes priority 4 for its P1, puts @labels inline and dates in plain English.
 */
export const parseTodoistCSV = (text: string, name: string, now = new Date()): ImportedProject => {
  const [header, ...rows] = parseCSV(text.replace(/^﻿/, ''))
  if (!header) throw new Error('That file is empty.')
  const col = (n: string) => header.findIndex((h) => h.trim().toUpperCase() === n)
  const [TYPE, CONTENT, DESCRIPTION, PRIORITY, INDENT, DATE] = ['TYPE', 'CONTENT', 'DESCRIPTION', 'PRIORITY', 'INDENT', 'DATE'].map(col)
  if (TYPE < 0 || CONTENT < 0) throw new Error('This does not look like a Todoist CSV export.')

  const project: ImportedProject = { name, sections: [], tasks: [] }
  let section: string | null = null
  for (const r of rows) {
    const type = r[TYPE]?.trim().toLowerCase()
    const content = r[CONTENT]?.trim() ?? ''
    if (type === 'section') {
      section = content
      project.sections.push(content)
    } else if (type === 'task' && content) {
      const parsed = parseQuickAdd(content, { projects: [], labels: [], now })
      const tokens = parsed.tokens.filter((t) => t.type === 'label')
      const title = tokens.reduceRight((s, t) => s.slice(0, t.start) + s.slice(t.end), content).replace(/\s+/g, ' ').trim()
      const todoistPriority = Number(r[PRIORITY] ?? 1) || 1
      const dateText = DATE >= 0 ? r[DATE]?.trim() : ''
      project.tasks.push({
        content: title || content,
        description: DESCRIPTION >= 0 ? (r[DESCRIPTION] ?? '').trim() : '',
        priority: (5 - Math.min(4, Math.max(1, todoistPriority))) as Priority,
        labels: parsed.labels,
        due: dateText ? (parseDate(dateText, now)?.due ?? null) : null,
        section,
        depth: Math.max(0, (Number(r[INDENT] ?? 1) || 1) - 1),
        comments: [],
      })
    } else if (type === 'note' && content) project.tasks[project.tasks.length - 1]?.comments.push(content)
  }
  return project
}
