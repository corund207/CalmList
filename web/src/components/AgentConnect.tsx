import { Bot, Check, Copy, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createToken, listTokens, revokeToken, type AgentToken } from '../store/agents'
import { usePrefs } from '../store/prefs'
import { PRESETS } from '../store/providers'
import { useUI } from '../store/ui'

type Client = 'claude' | 'claude-code' | 'chatgpt' | 'other'

const CLIENTS: [Client, string][] = [['claude', 'Claude'], ['claude-code', 'Claude Code'], ['chatgpt', 'ChatGPT'], ['other', 'Other']]

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="copy-field">
      <input className="field is-mono" readOnly value={value} aria-label={label} onFocus={(e) => e.target.select()} />
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true))}>
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function Instructions({ client, url, token }: { client: Client; url: string; token: string }) {
  const withToken = `${url}/${token}`
  if (client === 'claude')
    return (
      <>
        <p>In Claude (web or desktop): <strong>Settings → Connectors → Add custom connector</strong>. Name it CalmList, paste this URL and leave OAuth empty.</p>
        <CopyField value={withToken} label="Connector URL" />
      </>
    )
  if (client === 'claude-code')
    return (
      <>
        <p>Run this in a terminal. The token travels in a header, not the URL.</p>
        <CopyField value={`claude mcp add --transport http calmlist ${url} --header "Authorization: Bearer ${token}"`} label="Command" />
      </>
    )
  if (client === 'chatgpt')
    return (
      <>
        <p>In ChatGPT: <strong>Settings → Apps &amp; Connectors → Advanced settings</strong>, turn on Developer mode, then <strong>Create</strong>. Paste this URL and choose <em>No authentication</em>.</p>
        <CopyField value={withToken} label="Connector URL" />
      </>
    )
  return (
    <>
      <p>Any MCP client that speaks Streamable HTTP. Prefer the header where the client supports one. Gemini and Grok connectors are planned.</p>
      <CopyField value={url} label="Server URL" />
      <CopyField value={`Authorization: Bearer ${token}`} label="Header" />
    </>
  )
}

/** Connect Claude, ChatGPT and other MCP clients to this account with revocable tokens. */
export function AgentConnect({ onOpenSync }: { onOpenSync(): void }) {
  const { provider, session } = usePrefs()
  const { toast, open } = useUI()
  const [tokens, setTokens] = useState<AgentToken[] | null>(null)
  const [name, setName] = useState('Claude')
  const [client, setClient] = useState<Client>('claude')
  const [fresh, setFresh] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ready = !!PRESETS.mcpUrl && provider.kind === 'supabase' && !!session

  const refresh = () => listTokens().then(setTokens, (e: Error) => setError(e.message))
  useEffect(() => void (ready && refresh()), [ready])

  const create = () =>
    createToken(name || CLIENTS.find(([c]) => c === client)![1])
      .then((t) => (setFresh(t), setError(null), refresh()))
      .catch((e: Error) => setError(e.message))

  const revoke = (t: AgentToken) =>
    open({
      type: 'confirm',
      title: `Disconnect ${t.name}?`,
      body: 'The assistant using this token loses access right away.',
      action: 'Disconnect',
      onConfirm: () => void revokeToken(t.id).then(refresh).then(() => toast(`${t.name} disconnected.`)).catch((e: Error) => toast(e.message)),
    })

  return (
    <section className="integration">
      <header>
        <span className="provider-icon"><Bot size={18} /></span>
        <strong>AI assistants</strong>
        {!!tokens?.length && <span className="micro integration-status">{tokens.length} connected</span>}
      </header>
      <p>Let Claude, ChatGPT and other MCP clients read your tasks, add new ones and check them off. Each assistant gets its own token that you can revoke here. Tasks they add are marked as AI-made.</p>

      {!PRESETS.mcpUrl ? (
        <p className="form-hint">This copy of CalmList has no MCP endpoint. Deploy the repo to Vercel (see the README) to turn it on.</p>
      ) : !ready ? (
        <div className="actions"><button className="btn btn-secondary btn-sm" onClick={onOpenSync}>Sign In with Supabase First</button></div>
      ) : (
        <>
          <div className="segmented" role="radiogroup" aria-label="Assistant">
            {CLIENTS.map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={client === id} onClick={() => (setClient(id), setName(label), setFresh(null))}>{label}</button>
            ))}
          </div>
          {fresh ? (
            <div className="token-reveal">
              <Instructions client={client} url={PRESETS.mcpUrl} token={fresh} />
              <p className="form-hint">This token is shown once. Anyone who has it can change your tasks, so keep it private.</p>
              <div className="actions"><button className="btn btn-secondary btn-sm" onClick={() => setFresh(null)}>Done</button></div>
            </div>
          ) : (
            <div className="copy-field">
              <input className="field" value={name} maxLength={60} aria-label="Connection name" onChange={(e) => setName(e.target.value)} />
              <button className="btn btn-primary btn-sm" onClick={create}>Connect</button>
            </div>
          )}
          {error && <p className="form-hint" data-error>{error}</p>}
          {!!tokens?.length && (
            <ul className="token-list">
              {tokens.map((t) => (
                <li key={t.id}>
                  <span>
                    <strong>{t.name}</strong>
                    <span className="micro">…{t.hint} · {t.last_used_at ? `used ${new Date(t.last_used_at).toLocaleDateString()}` : 'never used'}</span>
                  </span>
                  <button className="btn btn-secondary btn-sm" aria-label={`Disconnect ${t.name}`} onClick={() => revoke(t)}><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
