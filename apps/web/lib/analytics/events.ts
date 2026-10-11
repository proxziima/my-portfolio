import type { PostHog } from 'posthog-js'

/** Where a link leads, for the outbound and conversion insights. */
export type LinkChannel = 'github' | 'linkedin' | 'email' | 'calendar' | 'other'

/**
 * The heavy experiences whose load time and failures are measured (`experience_ready` / `experience_failed`).
 * `os_app` only fails: an OS window whose app could not load or crashed.
 */
export type Experience = 'desk_scene' | 'os_boot' | 'dos_app' | 'twin_first_reply' | 'os_app'

/** Where the desk's WebGL draws: a worker (OffscreenCanvas) or, where that is not possible, the main thread. */
export type DeskHost = 'worker' | 'main'

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
  /** `host`: for `desk_scene`, the thread that drew the first frame with the models. */
  experience_ready: { experience: Experience; ms: number; app?: string; host?: DeskHost }
  /** `reason` is a short machine label, never error text. `host`: for `desk_scene`, the thread that failed. */
  experience_failed: { experience: Experience; reason: string; app?: string; host?: DeskHost }
}

export type AnalyticsEvent = keyof AnalyticsEvents
export type Track = <E extends AnalyticsEvent>(event: E, properties: AnalyticsEvents[E]) => void

/** What the senders need from posthog; handed over by `initPostHog` once the library has loaded. */
type Client = Pick<PostHog, 'capture' | 'captureException'>
type Send = (client: Client) => void

/** Enough for everything a visit does before the library arrives; beyond it the oldest go first. */
const QUEUE_MAX = 100
let client: Client | null = null
/** No client will ever come for this document (no token, or the chunk failed): events are dropped at once. */
let disabled = false
const queue: Send[] = []

/** Sends now, or once the client is attached; with analytics disabled, nothing is kept. */
function send(fn: Send): void {
  if (typeof window === 'undefined') return
  if (client) return fn(client)
  if (disabled) return
  queue.push(fn)
  if (queue.length > QUEUE_MAX) queue.shift()
}

/** Hands the loaded client over and flushes, in order, what was sent before it existed. */
export function attach(next: Client): void {
  client = next
  for (const fn of queue.splice(0)) fn(next)
}

/**
 * Analytics is off for this document (no token, or posthog-js could not load): drop what waited for
 * a client that never comes, and stop queueing what follows.
 */
export function disable(): void {
  disabled = true
  queue.length = 0
}

/** How many sends wait for the client (for tests). */
export const pending = (): number => queue.length

/** Sends one catalog event; before posthog-js has loaded it waits in a short in-memory queue. */
export const track: Track = (event, properties) => {
  send((c) => c.capture(event, properties))
}

/**
 * `track` for the moment the page hides or unloads: sent at once (the batch queue may never drain)
 * over a beacon, which the browser delivers after the page is gone. A beacon cannot be retried.
 * Before posthog-js has loaded it is queued like any event: a hidden tab often comes back, and the
 * flush still goes out as a beacon; a page that truly unloads first loses it, as no code is left.
 */
export const trackOnExit: Track = (event, properties) => {
  send((c) => c.capture(event, properties, { transport: 'sendBeacon', send_instantly: true }))
}

/** Reports an error an error boundary caught; queued like an event until posthog-js has loaded. */
export function captureException(error: unknown): void {
  send((c) => c.captureException(error))
}
