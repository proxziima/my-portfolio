import type { PostHogConfig } from '@repo/observability/config'

/** The first-party path posthog-js uses as `api_host`; it avoids words ad blockers match. */
export const RELAY_PATH = '/relay'

/**
 * Where a `/relay/*` request goes at PostHog (posthog.com/docs/advanced/proxy/nextjs): assets and
 * remote config to the assets host, everything else to ingestion. Null when unconfigured.
 */
export function relayTarget(pathname: string, search: string, hosts: Pick<PostHogConfig, 'ingestHost' | 'assetsHost'> | null): URL | null {
  if (!hosts || !pathname.startsWith(`${RELAY_PATH}/`)) return null
  const rest = pathname.slice(RELAY_PATH.length)
  const host = rest.startsWith('/static/') || rest.startsWith('/array/') ? hosts.assetsHost : hosts.ingestHost
  return new URL(`${rest}${search}`, host)
}
