import { describe, expect, it } from 'vitest'
import { toICS } from './ics'
import { parseCSV, parseTodoistCSV } from './todoist'
import { emptyData, type Data, type Task } from './types'

const now = new Date(2026, 8, 23, 10, 0)

describe('iCalendar export', () => {
  const data: Data = emptyData()
  data.projects.p = { id: 'p', name: 'Work', order: 0, view: 'list', createdAt: 0, updatedAt: 0 }
  const task = (id: string, extra: Partial<Task>): Task => ({
    id, content: id, description: '', projectId: 'p', sectionId: null, parentId: null, order: 0, priority: 4,
    due: null, labels: [], completed: false, completedAt: null, createdAt: 0, updatedAt: 0, ...extra,
  })
  data.tasks = {
    a: task('a', { content: 'Standup, daily', due: { date: '2026-09-24', time: '09:30', recurrence: { every: 1, unit: 'week', weekdays: [1, 3, 5] } } }),
    b: task('b', { due: { date: '2026-10-01' }, description: 'line one\nline two' }),
    c: task('c', {}),
    d: task('d', { due: { date: '2026-09-25' }, completed: true }),
  }
  const ics = toICS(data, now)

  it('exports open dated tasks only', () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('UID:a@calmlist')
    expect(ics).not.toContain('UID:c@calmlist')
    expect(ics).not.toContain('UID:d@calmlist')
  })

  it('writes timed, all-day and repeating events', () => {
    expect(ics).toContain('DTSTART:20260924T093000')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261001')
    expect(ics).toContain('SUMMARY:Standup\\, daily')
    expect(ics).toContain('DESCRIPTION:line one\\nline two')
  })
})

describe('Todoist import', () => {
  it('parses quoted CSV fields', () => {
    expect(parseCSV('a,"b, c","say ""hi"""\n1,2,3\n')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']])
  })

  it('maps a Todoist template export', () => {
    const csv = [
      'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE',
      'task,Plan launch @work,Big one,4,1,,,every monday,en,UTC',
      'task,Book venue,,1,2,,,oct 5,en,UTC',
      'note,Ask about parking,,,,,,,,',
      'section,Later,,,,,,,,',
      'task,Retro,,2,1,,,,en,UTC',
    ].join('\n')
    const p = parseTodoistCSV(csv, 'Launch', now)
    expect(p.sections).toEqual(['Later'])
    expect(p.tasks.map((t) => [t.content, t.priority, t.depth, t.section])).toEqual([
      ['Plan launch', 1, 0, null],
      ['Book venue', 4, 1, null],
      ['Retro', 3, 0, 'Later'],
    ])
    expect(p.tasks[0].labels).toEqual(['work'])
    expect(p.tasks[0].due?.recurrence).toEqual({ every: 1, unit: 'week', weekdays: [1] })
    expect(p.tasks[1].due?.date).toBe('2026-10-05')
    expect(p.tasks[1].comments).toEqual(['Ask about parking'])
  })

  it('rejects other CSV files', () => {
    expect(() => parseTodoistCSV('name,email\na,b', 'x')).toThrow(/Todoist/)
  })
})
