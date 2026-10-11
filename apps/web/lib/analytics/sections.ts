import type { Track } from './events'

/** A page section as `Section` renders it: `id` is its name (work, projects), the label points at its heading. */
export const PAGE_SECTION = 'section[id][aria-labelledby]'

/**
 * Reports `section_viewed` once per page section (by id) when half of it is on screen: on a one-page
 * portfolio, the sections people actually reach are the navigation funnel. Returns the stopper.
 */
export function observeSections(track: Track, root: ParentNode = document): () => void {
  const seen = new Set<string>()
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const section = entry.target.id
        if (!entry.isIntersecting || !section || seen.has(section)) continue
        seen.add(section)
        observer.unobserve(entry.target)
        track('section_viewed', { section })
      }
    },
    { threshold: 0.5 },
  )
  root.querySelectorAll(PAGE_SECTION).forEach((el) => observer.observe(el))
  return () => observer.disconnect()
}
