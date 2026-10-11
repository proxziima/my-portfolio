import posthog, { type PostHogConfig } from 'posthog-js'

/** What the browser needs: the public token and the app host. Ingestion goes through `/relay`. */
export interface ClientAnalyticsConfig {
  token: string
  uiHost: string
}

let started = false

/**
 * Starts posthog-js once per document. `embedded` is the /os desktop iframed on the desk monitor:
 * the parent page already records that view and its replay, so the frame only sends its own events.
 */
export function initPostHog(config: ClientAnalyticsConfig, embedded: boolean): void {
  if (started) return
  started = true
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
}
