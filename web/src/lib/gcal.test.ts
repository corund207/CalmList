import { describe, expect, it } from 'vitest'
import { eventId, fingerprint, planSync, toEvent } from './gcal'
import { emptyData, type Data, type Task } from './types'

const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id, createdAt: 0, updatedAt: 0, content: `Task ${id}`, description: '', projectId: 'p', sectionId: null, parentId: null,
  order: 0, priority: 4, due: null, labels: [], completed: false, completedAt: null, ...patch,
})

const data = (...tasks: Task[]): Data => {
  const d = emptyData()
  d.projects.p = { id: 'p', createdAt: 0, updatedAt: 0, name: 'Home', order: 0, view: 'list' }
  for (const t of tasks) d.tasks[t.id] = t
  return d
}

const APP = 'https://calmlist.test/app/'

describe('Google Calendar mapping', () => {
  it('makes ids Google accepts', () => {
    const id = eventId('3f2a-uuid_X')
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/)
    expect(eventId('3f2a-uuid_X')).toBe(id)
  })

  it('maps a date to an all-day event and a time to a 30-minute one', () => {
    const d = data(task('a', { due: { date: '2026-12-31' } }), task('b', { due: { date: '2026-12-31', time: '23:45' } }))
    expect(toEvent(d.tasks.a, d, 'Europe/Paris', APP)).toMatchObject({ start: { date: '2026-12-31' }, end: { date: '2027-01-01' }, transparency: 'transparent' })
    expect(toEvent(d.tasks.b, d, 'Europe/Paris', APP)).toMatchObject({
      start: { dateTime: '2026-12-31T23:45:00', timeZone: 'Europe/Paris' },
      end: { dateTime: '2027-01-01T00:15:00', timeZone: 'Europe/Paris' },
    })
  })

  it('carries repeats as RRULEs and links back to the task', () => {
    const d = data(task('r', { due: { date: '2026-10-05', recurrence: { every: 2, unit: 'week', weekdays: [1] } } }))
    const e = toEvent(d.tasks.r, d, 'UTC', APP)
    expect(e.recurrence).toEqual(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO'])
    expect(e.description).toContain(`${APP}#/task/r`)
  })

  it('only sends dated, open tasks that changed, and removes the rest', () => {
    const d = data(task('keep', { due: { date: '2026-10-01' } }), task('new', { due: { date: '2026-10-02' } }), task('undated'), task('done', { due: { date: '2026-10-01' }, completed: true }))
    const synced = { keep: fingerprint(toEvent(d.tasks.keep, d, 'UTC', APP)), done: 'x', gone: 'y' }
    const plan = planSync(d, synced, 'UTC', APP)
    expect(plan.upsert.map((e) => e.extendedProperties.private.calmlist)).toEqual(['new'])
    expect(plan.remove.sort()).toEqual(['done', 'gone'])
  })
})
