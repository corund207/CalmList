// Public, aggregate service numbers for the README badges and the status section. No personal data.
import { env, HttpError, json, rpc } from './_env'

export async function GET() {
  try {
    const stats = await rpc<Record<string, number | string | boolean | null>>('calmlist_service_stats', {}, env.serviceKey)
    const pct = (v: unknown) => (v === null || v === undefined ? 'n/a' : `${Number(v).toFixed(2)}%`)
    return json(
      { ...stats, uptime_24h_label: pct(stats.uptime_24h), uptime_7d_label: pct(stats.uptime_7d), uptime_30d_label: pct(stats.uptime_30d), status: stats.last_ok === false ? 'degraded' : 'operational' },
      200,
      { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=600', 'access-control-allow-origin': '*' },
    )
  } catch (e) {
    return json({ status: 'unknown', error: (e as Error).message }, e instanceof HttpError ? e.status : 500)
  }
}
