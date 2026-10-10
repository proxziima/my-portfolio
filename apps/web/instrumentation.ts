import type { Instrumentation } from 'next'

/** Server render, route handler and proxy errors go to PostHog Error Tracking. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { posthogConfig } = await import('@repo/observability/config')
  const { posthogIdsFromCookie } = await import('@repo/observability/cookie')
  const { captureServerError } = await import('@repo/observability/server')
  const config = posthogConfig()
  const cookie = request.headers.cookie
  const ids = config ? posthogIdsFromCookie(Array.isArray(cookie) ? cookie.join('; ') : cookie, config.token) : null
  captureServerError(error, {
    distinctId: ids?.distinctId,
    properties: { path: request.path, method: request.method, routePath: context.routePath, routeType: context.routeType },
  })
}
