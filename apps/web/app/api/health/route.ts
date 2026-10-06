/**
 * Liveness plus the running image's version (`APP_VERSION`, the commit CI built it from). The deploy
 * job's smoke test polls it until production reports the commit it just published.
 */
export function GET() {
  return Response.json(
    { ok: true, version: process.env.APP_VERSION || 'dev' },
    { headers: { 'cache-control': 'no-store' } },
  )
}
