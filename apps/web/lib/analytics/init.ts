import type { PostHog, PostHogConfig } from 'posthog-js'
import { attach, discardQueue } from './events'

/** What the browser needs: the public token and the app host. Ingestion goes through `/relay`. */
export interface ClientAnalyticsConfig {
  token: string
  uiHost: string
}

let started: Promise<void> | null = null

/**
 * Loads posthog-js (its own chunk, off the critical path) and starts it once per document, then
 * flushes what was tracked meanwhile. `embedded` is the /os desktop iframed on the desk monitor:
 * the parent page already records that view and its replay, so the frame only sends its own events.
 * Web vitals still count from the navigation: posthog reads them from buffered performance entries.
 */
export function initPostHog(config: ClientAnalyticsConfig, embedded: boolean): Promise<void> {
  started ??= import('posthog-js').then(
    ({ default: posthog }) => start(posthog, config, embedded),
    // the chunk did not load (offline, a deploy replaced it): analytics is off for this document
    () => discardQueue(),
  )
  return started
}

/** Today's options, unchanged; the embedded flag goes on before the queued events flush. */
function start(posthog: PostHog, config: ClientAnalyticsConfig, embedded: boolean): void {
  const options: Partial<PostHogConfig> = {
    api_host: '/relay',
    ui_host: config.uiHost,
    defaults: '2026-05-30',
    person_profiles: 'identified_only',
    capture_exceptions: true,
    capture_performance: { web_vitals: true, network_timing: true },
    respect_dnt: true,
    ...(embedded ? { capture_pageview: false, capture_pageleave: false, disable_session_recording: true } : {}),
  }
  posthog.init(config.token, options)
  if (embedded) posthog.register({ embedded: true })
  attach(posthog)
}
