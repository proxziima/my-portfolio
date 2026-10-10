import type { Track } from './events'

/**
 * Reports `section_viewed` once per labelled section when half of it is on screen: on a one-page
 * portfolio, the sections people actually reach are the navigation funnel. Returns the stopper.
 */
export function observeSections(track: Track, root: ParentNode = document): () => void {
  const seen = new Set<string>()
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const section = entry.target.getAttribute('aria-labelledby')
        if (!entry.isIntersecting || !section || seen.has(section)) continue
        seen.add(section)
        observer.unobserve(entry.target)
        track('section_viewed', { section })
      }
    },
    { threshold: 0.5 },
  )
  root.querySelectorAll('section[aria-labelledby]').forEach((el) => observer.observe(el))
  return () => observer.disconnect()
}
