/** Two ways to hear a Ramble: the browser's speech service, or Whisper on this device. */
import { unperiod } from './features'

export const WHISPER_MODELS = [
  { id: 'Xenova/whisper-tiny.en', label: 'Whisper tiny (English) · ~40 MB' },
  { id: 'Xenova/whisper-base.en', label: 'Whisper base (English) · ~80 MB · more accurate' },
  { id: 'Xenova/whisper-base', label: 'Whisper base (multilingual) · ~80 MB' },
]

/** The browser can't do speech here (no service, offline, unsupported language); Whisper on device still can. */
export class SpeechUnavailable extends Error {
  /** False when it may work next time (a dropped connection), so the choice isn't worth remembering. */
  lasting = true
}

/**
 * Cleans up what a speech engine wrote. Engines spell times and titles with periods ("3 p.m.", "Dr. Lee"),
 * which Ramble would read as the end of a task, and Whisper marks silence with tags like [BLANK_AUDIO].
 */
export const tidyTranscript = (text: string) => {
  const out = unperiod(text.replace(/\[[^\]]*\]|\((?:music|silence|blank[ _]audio|inaudible|noise)[^)]*\)/gi, ' '))
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/([.!?])\1+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
  // What Whisper "hears" in a silent clip.
  return /^(?:thank you|thanks for watching|you|bye)[.!]?$/i.test(out) ? '' : out
}

/** Phrases as sentences, so Ramble splits tasks where the speaker paused, even right after "p.m.". */
const sentences = (parts: string[]) =>
  parts
    .map(unperiod)
    .map((p) => (/[.!?,;:]$/.test(p) ? p : `${p}.`))
    .join(' ')

const join = (...parts: string[]) => parts.filter(Boolean).join(' ')

/* ─── Browser speech recognition ───────────────────────────────────────── */

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

const Recognition = (): (new () => SpeechRecognitionLike) | undefined =>
  (window as unknown as Record<string, new () => SpeechRecognitionLike>).SpeechRecognition ??
  (window as unknown as Record<string, new () => SpeechRecognitionLike>).webkitSpeechRecognition

export const browserSpeechAvailable = () => typeof window !== 'undefined' && !!Recognition()

/** Errors that mean the browser's speech service can't work here, so Whisper should take over. */
const NO_SERVICE = new Set(['service-not-allowed', 'network', 'language-not-supported'])

export interface Listener {
  /** Stops listening and resolves with everything heard, including words still being recognised. */
  stop(): Promise<string>
}

/** Streams words as they are recognised, across the pauses where browsers end a session. */
export function listenWithBrowser(handlers: {
  onText(text: string, interim: string): void
  onError(error: Error): void
}): Listener {
  const Ctor = Recognition()
  if (!Ctor) throw new SpeechUnavailable('This browser has no speech recognition.')
  let committed = '' // text from finished sessions
  let session = '' // final text of the current session
  let interim = ''
  let stopped = false
  let quickEnds = 0
  let rec: SpeechRecognitionLike
  let finish!: (text: string) => void
  const done = new Promise<string>((r) => (finish = r))
  const heard = () => tidyTranscript(join(committed, session, interim))

  const begin = () => {
    const started = Date.now()
    let gotResult = false
    // A fresh recognizer per session: some browsers refuse to restart a used one.
    rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = navigator.language || 'en-US'
    rec.onresult = (e) => {
      gotResult = true
      const finals: string[] = []
      let live = ''
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim()
        if (!t) continue
        if (!e.results[i].isFinal) live = join(live, t)
        // Android and iOS repeat earlier phrases inside later ones; keep the longest.
        else if (finals.length && t.toLowerCase().startsWith(finals[finals.length - 1].toLowerCase())) finals[finals.length - 1] = t
        else finals.push(t)
      }
      session = sentences(finals)
      interim = live
      handlers.onText(tidyTranscript(join(committed, session)), tidyTranscript(interim))
    }
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      stopped = true
      if (NO_SERVICE.has(e.error)) {
        const error = new SpeechUnavailable(e.error === 'network' ? 'Browser speech needs a connection.' : 'Browser speech isn’t available here.')
        error.lasting = e.error !== 'network'
        handlers.onError(error)
      } else handlers.onError(new Error(e.error === 'not-allowed' || e.error === 'audio-capture' ? 'Microphone access was blocked.' : `Speech recognition error: ${e.error}`))
    }
    rec.onend = () => {
      // Words still pending when a session ends are kept, not dropped.
      committed = join(committed, session, interim && sentences([interim]))
      session = interim = ''
      if (stopped) return finish(tidyTranscript(committed))
      // Sessions that end at once, again and again, mean the service isn't really there.
      quickEnds = !gotResult && Date.now() - started < 1500 ? quickEnds + 1 : 0
      if (quickEnds >= 3) {
        stopped = true
        handlers.onError(new SpeechUnavailable('Browser speech keeps stopping here.'))
        return finish(tidyTranscript(committed))
      }
      // Browsers end a session after a pause (Safari after each phrase); keep going until the person stops.
      try {
        begin()
      } catch {
        stopped = true
        finish(tidyTranscript(committed))
      }
    }
    rec.start()
  }

  begin()
  return {
    stop() {
      if (!stopped) {
        stopped = true
        rec.stop()
      }
      // The last words arrive just after stopping; don't wait forever for a browser that never ends the session.
      return Promise.race([done, new Promise<string>((r) => setTimeout(() => r(heard()), 2500))])
    },
  }
}

/* ─── Whisper on device ─────────────────────────────────────────────────── */

let worker: Worker | null = null
let seq = 0

type Progress = (text: string, fraction?: number) => void

const ask = (message: { model: string; audio?: Float32Array }, onProgress?: Progress) =>
  new Promise<string>((resolve, reject) => {
    worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
    const w = worker
    const id = ++seq
    const on = (e: MessageEvent) => {
      if (e.data.id !== id) return
      if (e.data.type === 'progress' && e.data.status === 'progress') onProgress?.('Downloading the speech model', (e.data.progress ?? 0) / 100)
      if (e.data.type === 'done') (w.removeEventListener('message', on), resolve(e.data.text ?? ''))
      if (e.data.type === 'error') (w.removeEventListener('message', on), reject(new Error(e.data.message)))
    }
    w.addEventListener('message', on)
    w.postMessage({ id, ...message }, message.audio ? [message.audio.buffer] : [])
  })

/** Whisper wants 16 kHz mono. Decoding at the source rate and resampling offline works in every browser. */
async function toMono16k(blob: Blob) {
  const ctx = new AudioContext()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    return (await offline.startRendering()).getChannelData(0)
  } finally {
    void ctx.close()
  }
}

export interface Recording {
  /** Stops recording and resolves with the transcript. */
  stop(): Promise<string>
  /** Stops recording and throws the audio away. */
  cancel(): void
}

/** Records until stopped, then transcribes the clip on this device. The model loads while you talk. */
export async function recordForWhisper(model: string, handlers: { onProgress?: Progress }): Promise<Recording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('This browser can’t record audio.')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }).catch(() => {
    throw new Error('Microphone access was blocked.')
  })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  recorder.start()
  // Fetch the model now, so the first transcription doesn't start with a download.
  let downloading = true
  const ready = ask({ model }, (t, f) => downloading && handlers.onProgress?.(t, f))
    .then(() => downloading && handlers.onProgress?.(''))
    .catch(() => {})
  const release = () => stream.getTracks().forEach((t) => t.stop())
  return {
    async stop() {
      await new Promise<void>((r) => {
        recorder.onstop = () => r()
        recorder.stop()
      })
      release()
      if (!chunks.length) return ''
      const audio = await toMono16k(new Blob(chunks, { type: recorder.mimeType })).catch(() => {
        throw new Error('That recording couldn’t be read. Try again, a little longer.')
      })
      if (audio.length < 16000 * 0.3) return ''
      await ready
      downloading = false
      handlers.onProgress?.('Transcribing on this device…')
      return tidyTranscript(await ask({ model, audio }, handlers.onProgress))
    },
    cancel() {
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
  }
}
