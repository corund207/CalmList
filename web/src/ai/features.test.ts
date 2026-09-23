import { describe, expect, it } from 'vitest'
import { extractJson } from './engine'
import { rambleWithRules } from './features'

const now = new Date(2026, 8, 23, 10, 0)
const ws = { projects: ['Work', 'Home'], labels: ['phone'], now }

describe('Ramble without a model', () => {
  it('splits a brain dump into tasks with dates and projects', () => {
    const drafts = rambleWithRules(
      "Okay so I need to call the dentist tomorrow at 3pm, and then pick up the dry cleaning. Also don't forget to send the report to Sam friday p1 #Work",
      ws,
    )
    expect(drafts.map((d) => d.content)).toEqual(['Call the dentist', 'Pick up the dry cleaning', 'Send the report to Sam'])
    expect(drafts[0].due).toEqual({ date: '2026-09-24', time: '15:00' })
    expect(drafts[2]).toMatchObject({ priority: 1, project: 'Work', due: { date: '2026-09-25' } })
  })

  it('handles one task per line', () => {
    expect(rambleWithRules('buy milk\nrenew passport next month\n\n', ws).map((d) => d.content)).toEqual(['Buy milk', 'Renew passport'])
  })
})

describe('extractJson', () => {
  it('reads JSON wrapped in code fences and chatter', () => {
    expect(extractJson('Sure! ```json\n{"tasks": []}\n``` hope that helps')).toEqual({ tasks: [] })
  })

  it('explains when there is no JSON', () => {
    expect(() => extractJson('no idea')).toThrow(/did not return JSON/)
  })
})
