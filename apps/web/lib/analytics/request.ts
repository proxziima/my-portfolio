import 'server-only'
import { posthogConfig, type PostHogConfig } from '@repo/observability/config'
import { posthogIdsFromCookie, type PostHogIds } from '@repo/observability/cookie'
import type { ClientAnalyticsConfig } from './init'

let warned = false

/**
 * `posthogConfig()` for per-request paths. A malformed env already fails startup in
 * `instrumentation.ts` `register()`; should one slip through, analytics turns off for the request
 * (logged once) rather than failing a page render or a twin call: observability never breaks a request.
 */
function requestConfig(): PostHogConfig | null {
  try {
    return posthogConfig()
  } catch (error) {
    if (!warned) {
      warned = true
      console.error('[analytics] disabled:', error instanceof Error ? error.message : error)
    }
    return null
  }
}

/** The browser's config, read from runtime env per request (the image is built without it). */
export function clientAnalyticsConfig(): ClientAnalyticsConfig | null {
  const config = requestConfig()
  return config ? { token: config.token, uiHost: config.uiHost } : null
}

/**
 * The visitor's PostHog ids from a Cookie header, or null (no token, no cookie, malformed). Takes
 * the array form too: `onRequestError` gets Node's raw headers, where a repeated header is an array.
 */
export function posthogIdsFromCookieHeader(header: string | string[] | null | undefined): PostHogIds | null {
  const config = requestConfig()
  return config ? posthogIdsFromCookie(Array.isArray(header) ? header.join('; ') : header, config.token) : null
}

/** The visitor's PostHog ids from the request cookie, or null (no token, no cookie, malformed). */
export function posthogIdsFromRequest(request: Request): PostHogIds | null {
  return posthogIdsFromCookieHeader(request.headers.get('cookie'))
}
