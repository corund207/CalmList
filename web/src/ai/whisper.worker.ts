// On-device speech-to-text with Whisper. The model downloads once, then runs offline.
// A message without audio only loads the model, so it can download while the person is still talking.
import { env, pipeline } from '@huggingface/transformers'
import asyncifyMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import asyncifyWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import plainMjs from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'
import plainWasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

// The ONNX runtime comes from this site rather than a CDN, and loads by URL rather than from a blob:
// the Content-Security-Policy allows scripts from 'self' only. Safari before 26 without WebGPU needs
// the build without asyncify, the same choice Transformers.js makes.
const ua = navigator.userAgent
const oldSafari = /Safari\//.test(ua) && !/Chrome|Chromium|Edg|CriOS|FxiOS/.test(ua) && Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 99) < 26
const plain = oldSafari && !('gpu' in navigator)
env.useWasmCache = false
env.backends.onnx.wasm!.wasmPaths = { mjs: plain ? plainMjs : asyncifyMjs, wasm: plain ? plainWasm : asyncifyWasm }

type Asr = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>

let asr: Promise<Asr> | null = null
let loaded = ''

self.onmessage = async (e: MessageEvent<{ id: number; model: string; audio?: Float32Array }>) => {
  const { id, model, audio } = e.data
  try {
    if (!asr || loaded !== model) {
      loaded = model
      asr = pipeline('automatic-speech-recognition', model, {
        progress_callback: (p: { status: string; progress?: number; file?: string }) =>
          self.postMessage({ id, type: 'progress', status: p.status, progress: p.progress, file: p.file }),
      }) as unknown as Promise<Asr>
    }
    const run = await asr
    if (!audio) return self.postMessage({ id, type: 'done', text: '' })
    const out = await run(audio, { chunk_length_s: 30, stride_length_s: 5 })
    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text
    self.postMessage({ id, type: 'done', text: text.trim() })
  } catch (err) {
    asr = null
    self.postMessage({ id, type: 'error', message: (err as Error).message })
  }
}
