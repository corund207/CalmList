import type { MLCEngineInterface } from '@mlc-ai/web-llm'
import { providerInfo, type AiConfig } from './config'

export type JsonSchema = Record<string, unknown>

export interface GenerateRequest {
  system: string
  prompt: string
  schema: JsonSchema
  /** A short label for the schema, used by providers that name their output formats. */
  name: string
}

export interface EngineContext {
  config: AiConfig
  apiKey?: string
  onProgress?(text: string, fraction?: number): void
}

export class AiError extends Error {}

/** Pulls a JSON object out of a reply, tolerating code fences and chatter around it. */
export const extractJson = <T,>(text: string): T => {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new AiError('The model did not return JSON. Try again or pick a larger model.')
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T
  } catch {
    throw new AiError('The model returned malformed JSON. Try again or pick a larger model.')
  }
}

const trim = (url: string) => url.trim().replace(/\/+$/, '')

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  } catch {
    throw new AiError(`Couldn't reach ${new URL(url).origin}. Is it running, and does it allow requests from this site (CORS)?`)
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new AiError(json?.error?.message ?? json?.error ?? `The model server answered ${res.status}.`)
  return json
}

/* ─── In-browser (WebLLM) ───────────────────────────────────────────────── */

let engine: { model: string; ready: Promise<MLCEngineInterface> } | null = null

const webllm = (model: string, onProgress?: EngineContext['onProgress']) => {
  if (engine?.model === model) return engine.ready
  if (!('gpu' in navigator)) throw new AiError('This browser has no WebGPU. Use Chrome, Edge or Safari 26+, or pick Ollama or Built-in rules.')
  engine = {
    model,
    ready: import('@mlc-ai/web-llm').then(({ CreateWebWorkerMLCEngine }) =>
      CreateWebWorkerMLCEngine(new Worker(new URL('./webllm.worker.ts', import.meta.url), { type: 'module' }), model, {
        initProgressCallback: (p) => onProgress?.(p.text, p.progress),
      }),
    ),
  }
  engine.ready.catch(() => (engine = null))
  return engine.ready
}

/** Downloads (or loads from cache) the in-browser model ahead of first use. */
export const warmUp = async (model: string, onProgress?: EngineContext['onProgress']) => {
  await webllm(model, onProgress)
}

/* ─── Providers ─────────────────────────────────────────────────────────── */

type Runner = (req: GenerateRequest, ctx: EngineContext) => Promise<unknown>

const runners: Record<Exclude<AiConfig['provider'], 'rules'>, Runner> = {
  async webllm(req, { config, onProgress }) {
    const e = await webllm(config.model || providerInfo('webllm').defaultModel, onProgress)
    const reply = await e.chat.completions.create({
      messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.prompt }],
      response_format: { type: 'json_object', schema: JSON.stringify(req.schema) },
      temperature: 0.2,
    })
    return extractJson(reply.choices[0]?.message?.content ?? '')
  },

  async ollama(req, { config }) {
    const json = await postJson(`${trim(config.baseUrl || providerInfo('ollama').defaultBaseUrl)}/api/chat`, {
      model: config.model || providerInfo('ollama').defaultModel,
      stream: false,
      format: req.schema,
      options: { temperature: 0.2 },
      messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.prompt }],
    })
    return extractJson(json.message?.content ?? '')
  },

  async compatible(req, ctx) {
    return openAiChat(req, ctx, false)
  },

  async openai(req, ctx) {
    return openAiChat(req, ctx, true)
  },

  async xai(req, ctx) {
    return openAiChat(req, ctx, true)
  },

  async gemini(req, { config, apiKey }) {
    if (!config.model) throw new AiError('Choose a Gemini model in Settings → AI.')
    const json = await postJson(
      `${trim(config.baseUrl || providerInfo('gemini').defaultBaseUrl)}/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: req.schema, temperature: 0.2 },
      },
      { 'x-goog-api-key': apiKey ?? '' },
    )
    return extractJson(json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '')
  },

  async anthropic(req, { config, apiKey }) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
    try {
      const response = await client.beta.messages.create({
        model: config.model || providerInfo('anthropic').defaultModel,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: req.schema } },
      } as unknown as Parameters<typeof client.beta.messages.create>[0])
      if ('stop_reason' in response && response.stop_reason === 'refusal') throw new AiError('Claude declined this request.')
      const text = 'content' in response ? response.content.map((b) => (b.type === 'text' ? b.text : '')).join('') : ''
      return extractJson(text)
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new AiError('Anthropic rejected the API key.')
      if (e instanceof Anthropic.RateLimitError) throw new AiError('Anthropic rate limit reached. Try again in a moment.')
      if (e instanceof Anthropic.APIError) throw new AiError(`Anthropic error ${e.status}: ${e.message}`)
      throw e
    }
  },
}

async function openAiChat(req: GenerateRequest, { config, apiKey }: EngineContext, strictSchema: boolean) {
  const info = providerInfo(config.provider)
  const base = trim(config.baseUrl || info.defaultBaseUrl)
  if (!config.model) throw new AiError(`Choose a model for ${info.name} in Settings → AI.`)
  const json = await postJson(
    `${base}/chat/completions`,
    {
      model: config.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: strictSchema ? req.system : `${req.system}\nReply with JSON matching this schema: ${JSON.stringify(req.schema)}` },
        { role: 'user', content: req.prompt },
      ],
      response_format: strictSchema
        ? { type: 'json_schema', json_schema: { name: req.name, schema: req.schema, strict: false } }
        : { type: 'json_object' },
    },
    apiKey ? { authorization: `Bearer ${apiKey}` } : {},
  )
  return extractJson(json.choices?.[0]?.message?.content ?? '')
}

export async function generateJson<T>(req: GenerateRequest, ctx: EngineContext): Promise<T> {
  if (ctx.config.provider === 'rules') throw new AiError('This needs a language model. Pick one in Settings → AI.')
  const info = providerInfo(ctx.config.provider)
  if (info.needsKey && !ctx.apiKey) throw new AiError(`Add your ${info.name} API key in Settings → AI.`)
  return (await runners[ctx.config.provider](req, ctx)) as T
}

/** Lists the models a server offers, so people pick from real names instead of typing them. */
export async function listModels(config: AiConfig, apiKey?: string): Promise<string[]> {
  const info = providerInfo(config.provider)
  const base = trim(config.baseUrl || info.defaultBaseUrl)
  const get = async (url: string, headers: Record<string, string> = {}) => {
    const res = await fetch(url, { headers }).catch(() => null)
    if (!res?.ok) throw new AiError(`Couldn't list models from ${info.name}${res ? ` (${res.status})` : ''}.`)
    return res.json()
  }
  switch (config.provider) {
    case 'webllm':
      return info.models!.map((m) => m.id)
    case 'ollama':
      return ((await get(`${base}/api/tags`)).models ?? []).map((m: { name: string }) => m.name)
    case 'gemini':
      return ((await get(`${base}/models`, { 'x-goog-api-key': apiKey ?? '' })).models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: { name: string }) => m.name.replace(/^models\//, ''))
    case 'anthropic': {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
      const ids: string[] = []
      for await (const m of client.models.list()) ids.push(m.id)
      return ids
    }
    case 'rules':
      return []
    default:
      return ((await get(`${base}/models`, apiKey ? { authorization: `Bearer ${apiKey}` } : {})).data ?? []).map((m: { id: string }) => m.id)
  }
}
