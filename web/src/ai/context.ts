import { usePrefs } from '../store/prefs'
import { useStore } from '../store/store'
import { providerInfo } from './config'
import type { EngineContext } from './engine'
import type { Workspace } from './features'

/** The current AI settings as an engine context. */
export const aiContext = (onProgress?: EngineContext['onProgress']): EngineContext => {
  const { ai, aiKeys } = usePrefs.getState()
  return { config: ai, apiKey: aiKeys[ai.provider], onProgress }
}

/** Project and label names, so models only pick from what exists. */
export const workspace = (): Workspace => {
  const { data } = useStore.getState()
  return {
    projects: Object.values(data.projects).filter((p) => !p.archived).map((p) => (p.inbox ? 'Inbox' : p.name)),
    labels: Object.values(data.labels).map((l) => l.name),
  }
}

/** A one-line description of who is answering, shown next to every AI result. */
export const aiByline = () => {
  const { ai } = usePrefs.getState()
  const info = providerInfo(ai.provider)
  const where = info.where === 'device' ? 'on this device' : info.where === 'your-machine' ? 'on your machine' : 'in the cloud'
  return `${info.name}${ai.model ? ` · ${ai.model.replace(/-q4f16_1-MLC$/, '')}` : ''} · ${where}`
}
