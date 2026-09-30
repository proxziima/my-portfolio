'use client'
import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * How far to scale an element of `width` CSS px down (or up) to fill its parent's width, kept current
 * as the parent resizes. Measured before paint, so the first frame is already fitted.
 */
// Contract: the element's parent is the sized box; the element itself is fixed-size and only scaled.
export function useFitScale(ref: RefObject<HTMLElement | null>, width: number): number {
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const parent = ref.current?.parentElement
    if (!parent) return
    const fit = () => setScale(parent.clientWidth / width)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [ref, width])

  return scale
}
