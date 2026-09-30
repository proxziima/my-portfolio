import { pageRect, type PageRect } from '@/lib/dom/page-rect'
import type { Measurements } from './guides'

const byAnchor = (anchor: string) => document.querySelector(`[data-anchor="${anchor}"]`)

/** A rendered anchor's page rect; undefined when it is missing or collapsed. */
const rectOf = (anchor: string): PageRect | undefined => {
  const el = byAnchor(anchor)
  return el && el.getBoundingClientRect().height > 2 ? pageRect(el) : undefined
}

/** Blocks whose vertical gaps get a marker, in page order. */
const GAP_CHAIN = ['links', 'work', 'projects', 'content']
/** How far the rails run past the end of `main`. */
const DOC_TAIL = 40

/**
 * Reads everything the guides hang off. Null while `main` has no width (not laid out yet, or hidden):
 * guides computed from that would all sit at 0,0.
 */
export function measure(): Measurements | null {
  const mainEl = document.querySelector('main')
  if (!mainEl || mainEl.getBoundingClientRect().width < 2) return null
  const main = pageRect(mainEl)

  const chain = GAP_CHAIN.flatMap((a) => rectOf(a) ?? [])
  const gaps = chain.slice(1).map((to, i) => ({ from: chain[i]!, to }))

  return {
    main,
    // not scrollHeight: the overlay itself inflates it, so the rails could only ever grow (the footer is in main)
    docHeight: main.bottom + DOC_TAIL,
    sections: {
      bio: rectOf('bio'), figure: rectOf('figure'), work: rectOf('work'), projects: rectOf('projects'), content: rectOf('content'),
    },
    gaps,
    anchors: { name: rectOf('name'), switch: rectOf('switch'), role: rectOf('role') },
    figure: rectOf('figure-box'),
  }
}
