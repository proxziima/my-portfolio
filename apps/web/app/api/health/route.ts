/**
 * Liveness plus the running image's version (`APP_VERSION`: the release, e.g. `0.0.1`, for published
 * images). The deploy job's smoke test polls it until production reports the release it just published.
 */
export function GET() {
  return Response.json(
    { ok: true, version: process.env.APP_VERSION || 'dev' },
    { headers: { 'cache-control': 'no-store' } },
  )
}
