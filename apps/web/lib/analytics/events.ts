import posthog from 'posthog-js'

/** Where a link leads, for the outbound and conversion insights. */
export type LinkChannel = 'github' | 'linkedin' | 'email' | 'calendar' | 'other'

/**
 * Every custom event the site sends and its properties. PostHog's defaults cover pageviews,
 * page leave (time on page, scroll depth), web vitals, autocapture and exceptions.
 */
export interface AnalyticsEvents {
  outbound_click: { href: string; host: string; kind: 'external' | 'mailto'; channel: LinkChannel; section: string | null }
  cta_clicked: { cta: string; section: string | null }
  section_viewed: { section: string }
  role_selected: { role: string }
  theme_changed: { theme: 'light' | 'dark' }
  os_app_opened: { app: string }
  twin_session_started: { resumed: boolean }
  twin_message_sent: { chars: number; turn: number }
  twin_refusal: { reason: string }
  twin_session_renewed: Record<string, never>
  booking_opened: Record<string, never>
  booking_completed: Record<string, never>
}

export type AnalyticsEvent = keyof AnalyticsEvents
export type Track = <E extends AnalyticsEvent>(event: E, properties: AnalyticsEvents[E]) => void

/** Sends one catalog event; a no-op until PostHog is initialised (no token, tests, SSR). */
export const track: Track = (event, properties) => {
  if (typeof window === 'undefined' || !posthog.__loaded) return
  posthog.capture(event, properties)
}
