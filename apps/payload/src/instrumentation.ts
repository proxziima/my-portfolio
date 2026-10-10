import type { Instrumentation } from 'next'

/** Admin, API and MCP request errors go to PostHog Error Tracking. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { captureServerError } = await import('@repo/observability/server')
  captureServerError(error, { distinctId: 'cms', properties: { path: request.path, method: request.method, routePath: context.routePath, routeType: context.routeType } })
}
