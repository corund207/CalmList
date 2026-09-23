// Runs a web-standard handler module (GET/POST/… exports) under Vercel's Node launcher.
import type { IncomingMessage, ServerResponse } from 'node:http'

type Handler = (req: Request) => Response | Promise<Response>

export const toNode = (mod: Partial<Record<string, Handler>>) => async (req: IncomingMessage, res: ServerResponse) => {
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
  const proto = headers.get('x-forwarded-proto') ?? 'https'
  const method = req.method ?? 'GET'
  const chunks: Buffer[] = []
  if (method !== 'GET' && method !== 'HEAD') for await (const c of req) chunks.push(c as Buffer)
  const request = new Request(`${proto}://${headers.get('host') ?? 'localhost'}${req.url ?? '/'}`, {
    method,
    headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  })
  const handler = mod[method]
  const response = handler ? await handler(request) : new Response('Method Not Allowed', { status: 405 })
  res.statusCode = response.status
  response.headers.forEach((v, k) => res.setHeader(k, v))
  res.end(Buffer.from(await response.arrayBuffer()))
}
