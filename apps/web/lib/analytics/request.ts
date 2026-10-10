import 'server-only'
import { posthogConfig } from '@repo/observability/config'
import { posthogIdsFromCookie, type PostHogIds } from '@repo/observability/cookie'
import type { ClientAnalyticsConfig } from './init'

/** The browser's config, read from runtime env per request (the image is built without it). */
export function clientAnalyticsConfig(): ClientAnalyticsConfig | null {
  const config = posthogConfig()
  return config ? { token: config.token, uiHost: config.uiHost } : null
}

/** The visitor's PostHog ids from the request cookie, or null (no token, no cookie, malformed). */
export function posthogIdsFromRequest(request: Request): PostHogIds | null {
  const config = posthogConfig()
  return config ? posthogIdsFromCookie(request.headers.get('cookie'), config.token) : null
}
