/** Which model answers CalmList's AI features. Local options are the default and cost nothing. */
export type AiProvider = 'rules' | 'webllm' | 'ollama' | 'compatible' | 'anthropic' | 'openai' | 'gemini' | 'xai'

export interface AiConfig {
  provider: AiProvider
  model: string
  baseUrl: string
}

export type SpeechEngine = 'browser' | 'whisper'

export interface ProviderInfo {
  id: AiProvider
  name: string
  /** Where prompts are processed; shown to people before they enable it. */
  where: 'device' | 'your-machine' | 'cloud'
  cost: string
  privacy: string
  needsKey: boolean
  defaultModel: string
  defaultBaseUrl: string
  models?: { id: string; label: string }[]
  keyUrl?: string
}

export const WEBLLM_MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 1.5B · ~1.6 GB · best balance' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 0.5B · ~0.9 GB · fastest' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B · ~0.9 GB' },
  { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 3B · ~2.5 GB · smartest' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 3B · ~2.3 GB' },
]

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'rules', name: 'Built-in rules', where: 'device', cost: 'Free', needsKey: false, defaultModel: '', defaultBaseUrl: '',
    privacy: 'No model at all. Ramble splits what you say into tasks with the same parser as Quick Add. Nothing leaves your device.',
  },
  {
    id: 'webllm', name: 'In-browser model', where: 'device', cost: 'Free', needsKey: false, defaultModel: WEBLLM_MODELS[0].id, defaultBaseUrl: '',
    privacy: 'A small open model runs on your GPU through WebGPU. It downloads once from Hugging Face (which sees your IP address), then works offline. Your tasks never leave the device.',
    models: WEBLLM_MODELS,
  },
  {
    id: 'ollama', name: 'Ollama', where: 'your-machine', cost: 'Free', needsKey: false, defaultModel: 'qwen2.5:3b', defaultBaseUrl: 'http://localhost:11434',
    privacy: 'Runs any open model on your own computer. Start Ollama with OLLAMA_ORIGINS set to this site so the browser may call it.',
  },
  {
    id: 'compatible', name: 'OpenAI-compatible server', where: 'your-machine', cost: 'Free if self-run', needsKey: false, defaultModel: '', defaultBaseUrl: 'http://localhost:1234/v1',
    privacy: 'LM Studio, llama.cpp, vLLM, LocalAI or a hosted gateway such as OpenRouter. Data goes wherever that server is.',
  },
  {
    id: 'anthropic', name: 'Claude (Anthropic)', where: 'cloud', cost: 'Your API key, billed by Anthropic', needsKey: true, defaultModel: 'claude-opus-5', defaultBaseUrl: '',
    privacy: 'The text you send an AI feature goes to Anthropic under their API terms. Your key stays in this browser.', keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai', name: 'ChatGPT (OpenAI)', where: 'cloud', cost: 'Your API key, billed by OpenAI', needsKey: true, defaultModel: '', defaultBaseUrl: 'https://api.openai.com/v1',
    privacy: 'The text you send an AI feature goes to OpenAI under their API terms. Your key stays in this browser.', keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'gemini', name: 'Gemini (Google)', where: 'cloud', cost: 'Your API key; Google offers a free tier', needsKey: true, defaultModel: '', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    privacy: 'The text you send goes to Google. On the free tier Google may use it to improve its products. Your key stays in this browser.', keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'xai', name: 'Grok (xAI)', where: 'cloud', cost: 'Your API key, billed by xAI', needsKey: true, defaultModel: '', defaultBaseUrl: 'https://api.x.ai/v1',
    privacy: 'The text you send goes to xAI under their API terms. Your key stays in this browser.', keyUrl: 'https://console.x.ai',
  },
]

export const providerInfo = (id: AiProvider) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]

export const DEFAULT_AI: AiConfig = { provider: 'rules', model: '', baseUrl: '' }
