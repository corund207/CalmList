import { describe, expect, it } from 'vitest'
import { parseDate, parseQuickAdd } from './parse'

// Wednesday 23 September 2026, 10:00
const now = new Date(2026, 8, 23, 10, 0)
const ctx = { projects: ['Work', 'Home Renovation'], labels: ['phone', 'errand'], sections: ['Q4 Plans'], now }
const date = (text: string) => parseDate(text, now)?.due

describe('parseDate', () => {
  it('reads relative days', () => {
    expect(date('today')).toEqual({ date: '2026-09-23' })
    expect(date('tomorrow')).toEqual({ date: '2026-09-24' })
    expect(date('in 3 days')).toEqual({ date: '2026-09-26' })
    expect(date('in two weeks')).toEqual({ date: '2026-10-07' })
    expect(date('next week')).toEqual({ date: '2026-09-28' })
    expect(date('this weekend')).toEqual({ date: '2026-09-26' })
  })

  it('reads weekdays as the next one to come', () => {
    expect(date('friday')).toEqual({ date: '2026-09-25' })
    expect(date('wednesday')).toEqual({ date: '2026-09-30' })
    expect(date('next mon')).toEqual({ date: '2026-09-28' })
  })

  it('does not mistake words for dates', () => {
    expect(date('buy sun cream')).toBeUndefined()
    expect(date('call Tom')).toBeUndefined()
    expect(date('read chapter 3 a')).toBeUndefined()
  })

  it('reads calendar dates, rolling past ones into next year', () => {
    expect(date('oct 5')).toEqual({ date: '2026-10-05' })
    expect(date('5th of january')).toEqual({ date: '2027-01-05' })
    expect(date('Dec 25, 2028')).toEqual({ date: '2028-12-25' })
    expect(date('2026-11-02')).toEqual({ date: '2026-11-02' })
    expect(date('12/31')).toEqual({ date: '2026-12-31' })
  })

  it('reads times, alone or with a date', () => {
    expect(date('tomorrow at 5pm')).toEqual({ date: '2026-09-24', time: '17:00' })
    expect(date('9:30am friday')).toEqual({ date: '2026-09-25', time: '09:30' })
    expect(date('at noon')).toEqual({ date: '2026-09-23', time: '12:00' })
    expect(date('8am')).toEqual({ date: '2026-09-24', time: '08:00' }) // already past today
    expect(date('meet at 3')).toEqual({ date: '2026-09-23', time: '15:00' })
  })

  it('reads recurrences', () => {
    expect(date('every day')).toEqual({ date: '2026-09-23', recurrence: { every: 1, unit: 'day' } })
    expect(date('every other week')).toEqual({ date: '2026-09-23', recurrence: { every: 2, unit: 'week' } })
    expect(date('every weekday')?.recurrence).toEqual({ every: 1, unit: 'week', weekdays: [1, 2, 3, 4, 5] })
    expect(date('every mon, fri at 9am')).toEqual({ date: '2026-09-25', time: '09:00', recurrence: { every: 1, unit: 'week', weekdays: [1, 5] } })
    expect(date('every! 3 days')?.recurrence).toEqual({ every: 3, unit: 'day', fromCompletion: true })
    expect(date('monthly')?.recurrence).toEqual({ every: 1, unit: 'month' })
    expect(date('Weekly review every friday 4pm')).toEqual({ date: '2026-09-25', time: '16:00', recurrence: { every: 1, unit: 'week', weekdays: [5] } })
  })
})

describe('parseQuickAdd', () => {
  it('pulls every token out of the title', () => {
    const p = parseQuickAdd('Call the plumber tomorrow at 4pm p1 #Home Renovation @phone', ctx)
    expect(p.content).toBe('Call the plumber')
    expect(p.due).toEqual({ date: '2026-09-24', time: '16:00' })
    expect(p.priority).toBe(1)
    expect(p.project).toBe('Home Renovation')
    expect(p.labels).toEqual(['phone'])
  })

  it('accepts new labels and projects as single words', () => {
    const p = parseQuickAdd('Groceries @errand @shopping #Life', ctx)
    expect(p.labels).toEqual(['errand', 'shopping'])
    expect(p.project).toBe('Life')
    expect(p.content).toBe('Groceries')
  })

  it('ignores sigils inside words and dates inside tokens', () => {
    const p = parseQuickAdd('Email bob@example.com about #Work friday', ctx)
    expect(p.labels).toEqual([])
    expect(p.content).toBe('Email bob@example.com about')
    expect(p.due?.date).toBe('2026-09-25')
  })

  it('reads sections and deadlines', () => {
    const p = parseQuickAdd('Draft roadmap /Q4 Plans {oct 30}', ctx)
    expect(p.section).toBe('Q4 Plans')
    expect(p.deadline).toBe('2026-10-30')
    expect(p.content).toBe('Draft roadmap')
  })

  it('returns token ranges for highlighting', () => {
    const input = 'Pay rent every month p2'
    const p = parseQuickAdd(input, ctx)
    expect(p.tokens.map((t) => input.slice(t.start, t.end))).toEqual(['every month', 'p2'])
  })
})
