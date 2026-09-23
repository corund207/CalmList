/** Two ways to hear a Ramble: the browser's speech service, or Whisper on this device. */

export const WHISPER_MODELS = [
  { id: 'Xenova/whisper-tiny.en', label: 'Whisper tiny (English) · ~40 MB' },
  { id: 'Xenova/whisper-base.en', label: 'Whisper base (English) · ~80 MB · more accurate' },
  { id: 'Xenova/whisper-base', label: 'Whisper base (multilingual) · ~80 MB' },
]

/* ─── Browser speech recognition ───────────────────────────────────────── */

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

const Recognition = (): (new () => SpeechRecognitionLike) | undefined =>
  (window as unknown as Record<string, new () => SpeechRecognitionLike>).SpeechRecognition ??
  (window as unknown as Record<string, new () => SpeechRecognitionLike>).webkitSpeechRecognition

export const browserSpeechAvailable = () => typeof window !== 'undefined' && !!Recognition()

export interface Listener {
  stop(): void
}

/** Streams words as they are recognised. Final text accumulates; interim text is shown live. */
export function listenWithBrowser(handlers: {
  onText(finalText: string, interim: string): void
  onEnd(): void
  onError(message: string): void
}): Listener {
  const Ctor = Recognition()
  if (!Ctor) throw new Error('This browser has no speech recognition. Use Whisper instead (Settings → AI).')
  const rec = new Ctor()
  rec.continuous = true
  rec.interimResults = true
  rec.lang = navigator.language || 'en-US'
  let finalText = ''
  let stopped = false
  rec.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) finalText += `${r[0].transcript.trim()}. `
      else interim += r[0].transcript
    }
    handlers.onText(finalText.trim(), interim.trim())
  }
  rec.onerror = (e) => e.error !== 'no-speech' && e.error !== 'aborted' && handlers.onError(e.error === 'not-allowed' ? 'Microphone access was blocked.' : `Speech recognition error: ${e.error}`)
  // Browsers end sessions after a pause; keep listening until the person stops.
  rec.onend = () => (stopped ? handlers.onEnd() : rec.start())
  rec.start()
  return {
    stop() {
      stopped = true
      rec.stop()
    },
  }
}

/* ─── Whisper on device ─────────────────────────────────────────────────── */

let worker: Worker | null = null
let seq = 0

const transcribe = (audio: Float32Array, model: string, onProgress?: (text: string, fraction?: number) => void) =>
  new Promise<string>((resolve, reject) => {
    worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
    const id = ++seq
    const on = (e: MessageEvent) => {
      if (e.data.id !== id) return
      if (e.data.type === 'progress' && e.data.status === 'progress') onProgress?.(`Downloading speech model ${e.data.file ?? ''}`, (e.data.progress ?? 0) / 100)
      if (e.data.type === 'done') (worker!.removeEventListener('message', on), resolve(e.data.text))
      if (e.data.type === 'error') (worker!.removeEventListener('message', on), reject(new Error(e.data.message)))
    }
    worker.addEventListener('message', on)
    worker.postMessage({ id, model, audio }, [audio.buffer])
  })

/** Records until stopped, then transcribes the whole clip on this device. */
export async function recordForWhisper(model: string, handlers: { onProgress?(text: string, fraction?: number): void }) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
    throw new Error('Microphone access was blocked.')
  })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => chunks.push(e.data)
  recorder.start()
  return {
    async stop(): Promise<string> {
      await new Promise<void>((r) => {
        recorder.onstop = () => r()
        recorder.stop()
      })
      stream.getTracks().forEach((t) => t.stop())
      const ctx = new AudioContext({ sampleRate: 16000 })
      const decoded = await ctx.decodeAudioData(await new Blob(chunks).arrayBuffer())
      await ctx.close()
      handlers.onProgress?.('Transcribing on this device…')
      return transcribe(decoded.getChannelData(0).slice(), model, handlers.onProgress)
    },
  }
}
