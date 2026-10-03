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
 */
export function useInView(ref: RefObject<Element | null>, { rootMargin, once = false }: InViewOptions = {}): boolean {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        setInView(entry.isIntersecting)
        if (once && entry.isIntersecting) io.disconnect()
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, rootMargin, once])

  return inView
}
