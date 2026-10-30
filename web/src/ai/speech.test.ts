import { afterEach, describe, expect, test, vi } from 'vitest'
import { rambleWithRules } from './features'
import { listenWithBrowser, SpeechUnavailable, tidyTranscript } from './speech'

const ws = { projects: [], labels: [], now: new Date('2026-10-29T10:00:00') }

describe('transcripts', () => {
  test('times and titles keep Ramble from splitting mid-task', () => {
    expect(tidyTranscript('call the dentist at 3 p.m. on Friday')).toBe('call the dentist at 3 pm on Friday')
    expect(tidyTranscript('Call the dentist at 3 P.M. Then buy milk.')).toBe('Call the dentist at 3 pm. Then buy milk.')
    expect(tidyTranscript('meet Dr. Smith at 10 a.m.')).toBe('meet Dr Smith at 10 am.')
    expect(tidyTranscript('[BLANK_AUDIO] buy milk ..  (music)')).toBe('buy milk.')
    expect(tidyTranscript(' Thank you. ')).toBe('')
  })

  test('Ramble reads spoken times', () => {
    const drafts = rambleWithRules('Call the dentist tomorrow at 3 p.m. Pick up dry cleaning. Meet Dr. Smith on Monday at 10 a.m.', ws)
    expect(drafts.map((d) => d.content)).toEqual(['Call the dentist', 'Pick up dry cleaning', 'Meet Dr Smith'])
    expect(drafts[0].due).toMatchObject({ date: '2026-10-30', time: '15:00' })
    expect(drafts[2].due).toMatchObject({ time: '10:00' })
  })
})

/* ─── A scripted SpeechRecognition ──────────────────────────────────────── */

type Result = { transcript: string; isFinal: boolean }

class FakeRecognition {
  static all: FakeRecognition[] = []
  continuous = false
  interimResults = false
  lang = ''
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  started = false
  constructor() {
    FakeRecognition.all.push(this)
  }
  start() {
    this.started = true
  }
  stop() {}
  say(...results: Result[]) {
    this.onresult?.({ results: results.map((r) => Object.assign([{ transcript: r.transcript }], { isFinal: r.isFinal })) })
  }
  end() {
    this.onend?.()
  }
  static get last() {
    return FakeRecognition.all[FakeRecognition.all.length - 1]
  }
}

const final = (transcript: string) => ({ transcript, isFinal: true })
const live = (transcript: string) => ({ transcript, isFinal: false })

const setup = () => {
  FakeRecognition.all = []
  vi.stubGlobal('window', { SpeechRecognition: FakeRecognition })
  vi.stubGlobal('navigator', { language: 'en-US' })
  const seen: { text: string; interim: string }[] = []
  const errors: Error[] = []
  const listener = listenWithBrowser({ onText: (text, interim) => seen.push({ text, interim }), onError: (e) => errors.push(e) })
  return { listener, seen, errors, latest: () => seen[seen.length - 1] }
}

afterEach(() => vi.unstubAllGlobals())

describe('browser speech', () => {
  test('streams words, and keeps going across the pauses where browsers end a session', async () => {
    const { listener, latest } = setup()
    const first = FakeRecognition.last
    expect(first.continuous && first.interimResults).toBe(true)
    first.say(live('call the'))
    expect(latest()).toEqual({ text: '', interim: 'call the' })
    first.say(final('call the dentist tomorrow at 3 p.m.'))
    first.end()
    expect(FakeRecognition.all).toHaveLength(2)
    // The pause after "p.m." still ends the task, though Chrome doesn't capitalize the next phrase.
    FakeRecognition.last.say(final('buy milk'))
    expect(latest().text).toBe('call the dentist tomorrow at 3 pm. buy milk.')
    const stopped = listener.stop()
    FakeRecognition.last.end()
    const heard = await stopped
    expect(heard).toBe('call the dentist tomorrow at 3 pm. buy milk.')
    expect(rambleWithRules(heard, ws).map((d) => [d.content, d.due?.time])).toEqual([['Call the dentist', '15:00'], ['Buy milk', undefined]])
  })

  test('collapses the repeated phrases Android and iOS send', () => {
    const { latest } = setup()
    FakeRecognition.last.say(final('buy'), final('buy milk'), final('buy milk and eggs'))
    expect(latest().text).toBe('buy milk and eggs.')
  })

  test('stopping keeps the last words, which arrive after stop()', async () => {
    const { listener } = setup()
    const rec = FakeRecognition.last
    rec.say(live('send Sam the rep'))
    const stopped = listener.stop()
    rec.say(final('send Sam the report by Friday'))
    rec.end()
    await expect(stopped).resolves.toBe('send Sam the report by Friday.')
    expect(FakeRecognition.all).toHaveLength(1)
  })

  test('keeps words still pending when a session ends on its own', async () => {
    const { listener } = setup()
    FakeRecognition.last.say(live('water the plants'))
    FakeRecognition.last.end()
    const stopped = listener.stop()
    FakeRecognition.last.end()
    await expect(stopped).resolves.toBe('water the plants.')
  })

  test('a blocked microphone stops instead of restarting forever', () => {
    const { errors } = setup()
    FakeRecognition.last.onerror?.({ error: 'not-allowed' })
    FakeRecognition.last.end()
    expect(FakeRecognition.all).toHaveLength(1)
    expect(errors[0].message).toBe('Microphone access was blocked.')
    expect(errors[0]).not.toBeInstanceOf(SpeechUnavailable)
  })

  test('no speech service hands over to Whisper', () => {
    const { errors } = setup()
    FakeRecognition.last.onerror?.({ error: 'service-not-allowed' })
    FakeRecognition.last.end()
    expect(errors[0]).toBeInstanceOf(SpeechUnavailable)
    expect((errors[0] as SpeechUnavailable).lasting).toBe(true)
  })

  test('a dropped connection hands over too, without being remembered', () => {
    const { errors } = setup()
    FakeRecognition.last.onerror?.({ error: 'network' })
    expect((errors[0] as SpeechUnavailable).lasting).toBe(false)
  })

  test('sessions that end at once, three times running, hand over to Whisper', () => {
    const { errors } = setup()
    FakeRecognition.last.end()
    FakeRecognition.last.end()
    FakeRecognition.last.end()
    expect(FakeRecognition.all).toHaveLength(3)
    expect(errors[0]).toBeInstanceOf(SpeechUnavailable)
  })

  test('ignores the silence a browser reports between phrases', () => {
    const { errors } = setup()
    FakeRecognition.last.onerror?.({ error: 'no-speech' })
    FakeRecognition.last.end()
    expect(errors).toHaveLength(0)
    expect(FakeRecognition.all).toHaveLength(2)
  })
})
