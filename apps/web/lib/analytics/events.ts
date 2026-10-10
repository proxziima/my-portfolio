import posthog from 'posthog-js'

/** Where a link leads, for the outbound and conversion insights. */
export type LinkChannel = 'github' | 'linkedin' | 'email' | 'calendar' | 'other'

/** The heavy experiences whose load time and failures are measured (`experience_ready` / `experience_failed`). */
export type Experience = 'desk_scene' | 'os_boot' | 'dos_app' | 'twin_first_reply'

/**
 * Every custom event the site sends and its properties. PostHog's defaults cover pageviews,
 * page leave (time on page, scroll depth), web vitals, autocapture and exceptions.
 */
export interface AnalyticsEvents {
  outbound_click: { href: string; host: string; kind: 'external' | 'mailto'; channel: LinkChannel; section: string | null }
  cta_clicked: { cta: string; section: string | null }
  section_viewed: { section: string }
  section_engaged: { section: string; seconds: number }
  role_selected: { role: string }
  theme_changed: { theme: 'light' | 'dark' }
  os_app_opened: { app: string }
  os_engaged: { seconds: number; embedded: boolean; apps_opened: number }
  twin_session_started: { resumed: boolean }
  twin_message_sent: { chars: number; turn: number }
  twin_refusal: { reason: string }
  twin_session_renewed: Record<string, never>
  booking_opened: Record<string, never>
  booking_completed: Record<string, never>
  experience_ready: { experience: Experience; ms: number; app?: string }
  /** `reason` is a short machine label, never error text. */
  experience_failed: { experience: Experience; reason: string; app?: string }
}

export type AnalyticsEvent = keyof AnalyticsEvents
export type Track = <E extends AnalyticsEvent>(event: E, properties: AnalyticsEvents[E]) => void

const ready = () => typeof window !== 'undefined' && posthog.__loaded

/** Sends one catalog event; a no-op until PostHog is initialised (no token, tests, SSR). */
export const track: Track = (event, properties) => {
  if (ready()) posthog.capture(event, properties)
}

/**
 * `track` for the moment the page hides or unloads: sent at once (the batch queue may never drain)
 * over a beacon, which the browser delivers after the page is gone. A beacon cannot be retried.
 */
export const trackOnExit: Track = (event, properties) => {
  if (ready()) posthog.capture(event, properties, { transport: 'sendBeacon', send_instantly: true })
}
