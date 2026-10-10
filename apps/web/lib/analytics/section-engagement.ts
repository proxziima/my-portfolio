import { createEngagementClock, installActivityListeners, onPageExit, reportableSeconds, type EngagementClock } from './engagement'
import type { Track } from './events'
import { PAGE_SECTION } from './sections'

/**
 * Engaged time per page section: one clock per section, running while half of it is on screen, the
 * tab is visible and the visitor is active. Each page exit (hide or unload) reports `section_engaged`
 * per section with a second or more, then resets, so a tab hidden and shown again reports again:
 * insights sum `seconds` per visit. Returns the stopper.
 */
export function trackSectionEngagement(sendOnExit: Track, root: ParentNode = document): () => void {
  const sections = new Map<Element, { clock: EngagementClock; inView: boolean }>()
  const visible = () => document.visibilityState === 'visible'
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const section = sections.get(entry.target)
        if (!section) continue
        section.inView = entry.isIntersecting
        section.clock.setActive(section.inView && visible())
      }
    },
    { threshold: 0.5 },
  )
  root.querySelectorAll(PAGE_SECTION).forEach((el) => {
    sections.set(el, { clock: createEngagementClock(), inView: false })
    observer.observe(el)
  })

  const onVisibility = () => {
    for (const { clock, inView } of sections.values()) {
      clock.setActive(inView && visible())
      // coming back to the tab is an interaction: the visitor chose to look again
      if (visible()) clock.activity()
    }
  }
  const flush = () => {
    for (const [el, { clock }] of sections) {
      const seconds = reportableSeconds(clock.seconds())
      clock.reset()
      if (seconds !== null) sendOnExit('section_engaged', { section: el.id, seconds })
    }
  }

  document.addEventListener('visibilitychange', onVisibility)
  const uninstallActivity = installActivityListeners(() => {
    for (const { clock } of sections.values()) clock.activity()
  })
  const uninstallExit = onPageExit(flush)
  return () => {
    observer.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    uninstallActivity()
    uninstallExit()
  }
}
