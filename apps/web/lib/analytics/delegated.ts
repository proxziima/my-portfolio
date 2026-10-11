import type { AnalyticsEvents, LinkChannel, Track } from './events'
import { PAGE_SECTION } from './sections'

const CHANNELS: ReadonlyArray<[RegExp, LinkChannel]> = [
  [/(^|\.)github\.com$/, 'github'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)(cal\.com|calendly\.com)$/, 'calendar'],
]

/** An outbound link's tracking properties (minus section), or null when it stays on the site. */
export function classifyLink(href: string, origin: string): Omit<AnalyticsEvents['outbound_click'], 'section'> | null {
  if (href.startsWith('mailto:')) {
    const host = href.slice(7).split('?')[0]?.split('@')[1] ?? ''
    return { href, host, kind: 'mailto', channel: 'email' }
  }
  let url: URL
  try {
    url = new URL(href, origin)
  } catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol) || url.origin === origin) return null
  const host = url.hostname
  const channel = CHANNELS.find(([pattern]) => pattern.test(host))?.[1] ?? 'other'
  return { href: url.href, host, kind: 'external', channel }
}

/** The page section (its id) a click happened in: the home page is one long page, sections are its map. */
function sectionOf(el: Element): string | null {
  return el.closest(PAGE_SECTION)?.id || null
}

/**
 * One document-level click listener for every outbound link and `[data-track]` CTA. It covers
 * React links and the raw-HTML bio links alike, with no per-component wiring. Returns the uninstaller.
 */
export function installDelegatedTracking(track: Track): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target) return
    const cta = target.closest('[data-track]')
    if (cta) track('cta_clicked', { cta: cta.getAttribute('data-track') ?? '', section: sectionOf(cta) })
    const anchor = target.closest('a[href]')
    if (!anchor) return
    const link = classifyLink(anchor.getAttribute('href') ?? '', window.location.origin)
    if (link) track('outbound_click', { ...link, section: sectionOf(anchor) })
  }
  document.addEventListener('click', onClick, { capture: true })
  return () => document.removeEventListener('click', onClick, { capture: true })
}
