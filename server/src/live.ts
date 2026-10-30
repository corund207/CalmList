// Live updates for open apps: a Server-Sent Events stream per signed-in device. "sync" means pull now;
// "google" means the person's Google calendars changed. The poll in the app stays as a safety net.

type Send = (event: string) => void
const streams = new Map<string, Set<Send>>()

export const notify = (userId: string, event: 'sync' | 'google') => streams.get(userId)?.forEach((send) => send(event))

/** An event stream for one user, kept open (with a heartbeat every 25 s, under proxy timeouts) until the client goes. */
export function liveStream(userId: string, signal: AbortSignal): Response {
  const encoder = new TextEncoder()
  let close = () => {}
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          close()
        }
      }
      const send: Send = (event) => write(`event: ${event}\ndata: {}\n\n`)
      const beat = setInterval(() => write(': keep-alive\n\n'), 25_000)
      const set = streams.get(userId) ?? new Set()
      streams.set(userId, set.add(send))
      close = () => {
        clearInterval(beat)
        set.delete(send)
        if (!set.size) streams.delete(userId)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
      signal.addEventListener('abort', close)
      write('retry: 5000\n\n')
    },
    cancel: () => close(),
  })
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' },
  })
}
