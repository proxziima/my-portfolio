'use client'
import type { ScheduleCallRendered } from '@repo/twin/contract'

/** One queued call: the method name, then its arguments, as embed.js replays it. */
type CalCommand = unknown[]

/** A namespaced Cal instance; until embed.js loads, its calls wait in `q`. */
export interface CalNamespace {
  (method: string, options: Record<string, unknown>): void
  q: CalCommand[]
}

/** The slice of Cal.com's documented global `Cal` this window calls (cal.com docs: Embed). */
export interface CalApi {
  (method: 'init', namespace: string, options: { origin: string }): void
  ns: Record<string, CalNamespace>
  q: CalCommand[]
  loaded: boolean
}

declare global {
  interface Window {
    Cal?: CalApi
  }
}

/** Inline-embed config: the signed booking ref returns through the webhook as metadata. */
export function embedConfig(o: { bookingRef: string; prefillName?: string }): Record<string, string> {
  return { layout: 'month_view', theme: 'light', 'metadata[bookingRef]': o.bookingRef, ...(o.prefillName ? { name: o.prefillName } : {}) }
}

/** "11:00" style time in a zone, for the two-zone header. */
export function formatZoneTime(at: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at)
}

/**
 * Installs Cal.com's global `Cal` exactly as the official loader snippet does (calcom/cal.com,
 * packages/embeds/embed-snippet), once per page: the first call appends embed.js, `init` with a
 * namespace creates that namespace's queue and tells the global queue to `initNamespace` it, and
 * every other call is queued until embed.js replays the queues. Queued entries are arrays rather
 * than `arguments` objects, which embed.js reads the same way.
 */
export function loadCal(scriptUrl: string): CalApi {
  const existing = window.Cal
  if (existing) return existing
  const push = (target: { q: CalCommand[] }, command: CalCommand) => {
    target.q.push(command)
  }
  const cal: CalApi = Object.assign(
    (...args: CalCommand) => {
      if (!cal.loaded) {
        document.head.appendChild(document.createElement('script')).src = scriptUrl
        cal.loaded = true
      }
      const [method, namespace] = args
      if (method === 'init' && typeof namespace === 'string') {
        const api: CalNamespace = Object.assign((...command: CalCommand) => push(api, command), { q: [] as CalCommand[] })
        // Re-running init never replaces a namespace embed.js may already have taken over.
        const target = cal.ns[namespace] ?? api
        cal.ns[namespace] = target
        push(target, args)
        push(cal, ['initNamespace', namespace])
        return
      }
      push(cal, args)
    },
    { ns: {} as Record<string, CalNamespace>, q: [] as CalCommand[], loaded: false },
  )
  window.Cal = cal
  return cal
}

// Elements that already hold a booker. React's development double-run of effects reuses the same
// element, and a second `inline` would draw a second booker into it.
const mounted = new WeakSet<HTMLElement>()

/** Draws the inline Cal.com booker into `el` under its own namespace, once per element. */
export function mountInline(
  el: HTMLElement,
  ns: string,
  booking: Pick<ScheduleCallRendered, 'calOrigin' | 'embedScriptUrl' | 'calLink' | 'bookingRef' | 'prefillName'>,
): void {
  if (mounted.has(el)) return
  mounted.add(el)
  const cal = loadCal(booking.embedScriptUrl)
  if (!cal.ns[ns]) cal('init', ns, { origin: booking.calOrigin })
  const api = cal.ns[ns]
  // The snippet registers a string namespace synchronously inside `init`.
  if (!api) throw new Error(`Cal.com namespace "${ns}" was not registered`)
  api('inline', { elementOrSelector: el, calLink: booking.calLink, config: embedConfig(booking) })
  api('ui', { hideEventTypeDetails: false, layout: 'month_view' })
}
