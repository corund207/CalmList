// On-device speech-to-text with Whisper. The model downloads once, then runs offline.
import { pipeline } from '@huggingface/transformers'

type Asr = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>

let asr: Promise<Asr> | null = null
let loaded = ''

self.onmessage = async (e: MessageEvent<{ id: number; model: string; audio: Float32Array }>) => {
  const { id, model, audio } = e.data
  try {
    if (!asr || loaded !== model) {
      loaded = model
      asr = pipeline('automatic-speech-recognition', model, {
        progress_callback: (p: { status: string; progress?: number; file?: string }) =>
          self.postMessage({ id, type: 'progress', status: p.status, progress: p.progress, file: p.file }),
      }) as unknown as Promise<Asr>
    }
    const out = await (await asr)(audio, { chunk_length_s: 30, stride_length_s: 5 })
    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text
    self.postMessage({ id, type: 'done', text: text.trim() })
  } catch (err) {
    asr = null
    self.postMessage({ id, type: 'error', message: (err as Error).message })
  }
}
