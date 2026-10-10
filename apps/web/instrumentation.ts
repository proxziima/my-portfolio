import type { Instrumentation } from 'next'

/**
 * Validates the env the request paths read, once at boot: a malformed `POSTHOG_REGION` or
 * `SITE_URL` fails startup loudly instead of surfacing per request, where the analytics helpers
 * would only switch themselves off and `siteUrl()` would fail every page's metadata.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { posthogConfig } = await import('@repo/observability/config')
  const { siteUrl } = await import('./lib/site')
  posthogConfig()
  siteUrl()
}

/**
 * Server render, route handler and proxy errors go to PostHog Error Tracking. The path is sent
 * without its query string, which can carry secrets (`/api/preview?previewSecret=…`).
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { posthogIdsFromCookieHeader } = await import('./lib/analytics/request')
  const { captureServerError } = await import('@repo/observability/server')
  captureServerError(error, {
    distinctId: posthogIdsFromCookieHeader(request.headers.cookie)?.distinctId,
    properties: { path: request.path.split('?')[0], method: request.method, routePath: context.routePath, routeType: context.routeType },
  })
}
