import { PostHog } from 'posthog-node'
import { posthogConfig } from './config'

/** The slice of posthog-node the apps use; the no-op client implements the same shape. */
export interface ServerPostHog {
  capture(message: { distinctId: string; event: string; properties?: Record<string, unknown> }): void
  captureException(error: unknown, distinctId?: string, properties?: Record<string, unknown>): void
  flush(): Promise<void>
}

const NOOP: ServerPostHog = { capture() {}, captureException() {}, flush: async () => {} }

let client: ServerPostHog | null = null

/**
 * The process's PostHog client, built on first use from runtime env (never at import: builds have
 * no env). `flushAt: 1` sends each event at once, so a process that dies without a shutdown loses
 * nothing queued, and no SIGTERM handler (which would block the default exit) is needed.
 */
export function serverPostHog(): ServerPostHog {
  if (client) return client
  const config = posthogConfig()
  client = config ? new PostHog(config.token, { host: config.ingestHost, flushAt: 1, flushInterval: 0 }) : NOOP
  return client
}

/** Reports a server error to Error Tracking. Fire-and-forget: observability never fails a request. */
export function captureServerError(error: unknown, opts: { distinctId?: string; properties?: Record<string, unknown> } = {}): void {
  try {
    serverPostHog().captureException(error, opts.distinctId, opts.properties)
  } catch (err) {
    console.warn('[observability] captureException failed', err instanceof Error ? err.message : err)
  }
}
