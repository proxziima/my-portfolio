'use client'
import { useEffect, useRef } from 'react'
import { track } from '@/lib/analytics/events'

/**
 * A wheel spin or drag walks through several roles in a second; only where the
 * visitor stops is a choice. Wait this long after the last change before counting it.
 */
const SETTLE_MS = 800

/**
 * Emits `role_selected` once per settled user choice, whatever the input (select, or
 * step from the wheel, drag, row click). `animate` is false after init and hydrate, so
 * restoring the saved role never counts. A spin that ends where it began is a no-op.
 */
export function useRoleAnalytics(currentSlug: string, animate: boolean) {
  const last = useRef(currentSlug)
  /** Role when the current interaction began; null while idle. */
  const start = useRef<string | null>(null)

  useEffect(() => {
    if (!animate) {
      start.current = null
      last.current = currentSlug
      return
    }
    start.current ??= last.current
    last.current = currentSlug
    const id = setTimeout(() => {
      if (currentSlug !== start.current) track('role_selected', { role: currentSlug })
      start.current = null
    }, SETTLE_MS)
    return () => clearTimeout(id)
  }, [currentSlug, animate])
}
