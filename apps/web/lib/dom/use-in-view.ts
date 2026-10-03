'use client'
import { useEffect, useState, type RefObject } from 'react'

export interface InViewOptions {
  /** Grows (or shrinks) the viewport the element is tested against, as in IntersectionObserver. */
  rootMargin?: string
  /** Latch on the first intersection and stop observing: for "mount once it comes near". */
  once?: boolean
}

/**
 * Whether the element intersects the viewport, kept current by an IntersectionObserver. Starts false
 * (on the server too, so hydration matches) until the observer's first report.
 * The ref's element must be mounted on the first commit: the observer is attached once, not re-attached
 * if the element appears later.
 */
export function useInView(ref: RefObject<Element | null>, { rootMargin, once = false }: InViewOptions = {}): boolean {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        const latest = entries.at(-1)
        if (!latest) return
        // entries are chronological: the last is current; a `once` latch takes any hit in the batch
        const hit = once && entries.some((e) => e.isIntersecting)
        setInView(hit || latest.isIntersecting)
        if (hit) io.disconnect()
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, rootMargin, once])

  return inView
}
