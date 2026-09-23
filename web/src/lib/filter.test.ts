import { describe, expect, it } from 'vitest'
import { runFilter, validateFilter } from './filter'
import { nextOccurrence } from './recurrence'
import { emptyData, type Data, type Task } from './types'

const now = new Date(2026, 8, 23, 10, 0)

const data: Data = emptyData()
data.projects.p1 = { id: 'p1', name: 'Work', order: 0, view: 'list', createdAt: 0, updatedAt: 0 }
data.labels.l1 = { id: 'l1', name: 'phone', order: 0, createdAt: 0, updatedAt: 0 }
const task = (id: string, extra: Partial<Task>): Task => ({
  id, content: id, description: '', projectId: 'p1', sectionId: null, parentId: null, order: 0, priority: 4,
  due: null, labels: [], completed: false, completedAt: null, createdAt: 0, updatedAt: 0, ...extra,
})
data.tasks = {
  a: task('a', { due: { date: '2026-09-23' }, priority: 1 }),
  b: task('b', { due: { date: '2026-09-20' }, labels: ['l1'] }),
  c: task('c', { due: { date: '2026-09-27' } }),
  d: task('d', {}),
  e: task('e', { due: { date: '2026-09-23' }, completed: true }),
}

const ids = (q: string) => runFilter(q, data, now).map((t) => t.id).sort()

describe('filters', () => {
  it('matches single terms', () => {
    expect(ids('today')).toEqual(['a'])
    expect(ids('overdue')).toEqual(['b'])
    expect(ids('no date')).toEqual(['d'])
    expect(ids('7 days')).toEqual(['a', 'c'])
    expect(ids('@phone')).toEqual(['b'])
    expect(ids('#work')).toEqual(['a', 'b', 'c', 'd'])
    expect(ids('p1')).toEqual(['a'])
  })

  it('combines with operators', () => {
    expect(ids('today | overdue')).toEqual(['a', 'b'])
    expect(ids('(today | overdue) & !p1')).toEqual(['b'])
    expect(ids('#Work & !no date & !@phone')).toEqual(['a', 'c'])
  })

  it('reports bad queries', () => {
    expect(validateFilter('today &')).toBeTruthy()
    expect(validateFilter('(today')).toBe('Missing )')
    expect(validateFilter('p1 | overdue')).toBeNull()
  })
})

describe('recurrence', () => {
  it('advances from the due date', () => {
    expect(nextOccurrence({ date: '2026-09-23', recurrence: { every: 1, unit: 'day' } }, now).date).toBe('2026-09-24')
    expect(nextOccurrence({ date: '2026-01-31', recurrence: { every: 1, unit: 'month' } }, new Date(2026, 0, 31)).date).toBe('2026-02-28')
  })

  it('skips past occurrences when completed late', () => {
    expect(nextOccurrence({ date: '2026-09-01', recurrence: { every: 1, unit: 'week' } }, now).date).toBe('2026-09-29')
  })

  it('walks listed weekdays', () => {
    const r = { every: 1, unit: 'week' as const, weekdays: [1, 3, 5] }
    expect(nextOccurrence({ date: '2026-09-23', recurrence: r }, now).date).toBe('2026-09-25')
    expect(nextOccurrence({ date: '2026-09-25', recurrence: r }, new Date(2026, 8, 25)).date).toBe('2026-09-28')
  })

  it('counts from completion with every!', () => {
    expect(nextOccurrence({ date: '2026-09-01', recurrence: { every: 3, unit: 'day', fromCompletion: true } }, now).date).toBe('2026-09-26')
  })
})
