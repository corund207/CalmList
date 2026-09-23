// The CalmList MCP endpoint (Streamable HTTP, stateless) for Claude, ChatGPT and other agents.
// Authenticated by a personal access token, as a bearer header or in the URL (/api/mcp/<token>).
// The database resolves the token and scopes every read and write to its owner.
import { handleRpc, type AgentChange, type AgentStore } from '../web/src/agent/mcp'
import { HttpError, json, rpc } from './_env'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
}

const tokenOf = (req: Request) => {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]
  return bearer ?? new URL(req.url).searchParams.get('token') ?? ''
}

const storeFor = (token: string): AgentStore => ({
  read: () => rpc<{ timezone: string; items: AgentChange[] }>('calmlist_agent_read', { p_token: token }),
  write: async (changes) => void (await rpc('calmlist_agent_write', { p_token: token, p_changes: changes })),
})

export async function POST(req: Request) {
  const token = tokenOf(req)
  if (!token) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Missing token. Create one in CalmList → Settings → Integrations → AI assistants.' } }, 401, CORS)
  let msg: unknown
  try {
    msg = await req.json()
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400, CORS)
  }
  if (Array.isArray(msg)) return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batches are not supported' } }, 400, CORS)
  const appUrl = process.env.APP_URL ?? `${new URL(req.url).origin}/app/`
  try {
    const reply = await handleRpc(msg as Parameters<typeof handleRpc>[0], storeFor(token), { appUrl })
    return reply ? json(reply, 200, CORS) : new Response(null, { status: 202, headers: CORS })
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    const message = status === 401 ? 'This token is invalid or was revoked.' : status === 500 ? 'Internal error' : (e as Error).message
    if (status === 500) console.error(e)
    return json({ jsonrpc: '2.0', id: (msg as { id?: unknown }).id ?? null, error: { code: -32000, message } }, status, CORS)
  }
}

// Stateless: no server-initiated stream and no sessions to end.
export const GET = () => new Response('Method Not Allowed', { status: 405, headers: { ...CORS, allow: 'POST' } })
export const DELETE = GET
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS })
