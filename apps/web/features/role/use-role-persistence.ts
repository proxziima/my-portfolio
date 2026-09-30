'use client'
import { useEffect, useLayoutEffect, useRef } from 'react'

const STORAGE_KEY = 'role'

interface Options {
  slugs: string[]
  currentSlug: string
  /** Jump without animation (used before first paint). */
  hydrate: (slug: string) => void
  /** Animated change (deep links, shortcuts). */
  select: (slug: string) => void
}

const readStored = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Keeps the role in the URL hash and localStorage, and wires the 1..n shortcuts. */
export function useRolePersistence({ slugs, currentSlug, hydrate, select }: Options) {
  const ready = useRef(false)
  // Slug the hydrate asked for, until the state has rendered it.
  const target = useRef<string | null>(null)

  // Before first paint: apply the hash or stored role without animation (Q4).
  useLayoutEffect(() => {
    const initial = [location.hash.slice(1), readStored()].find((s) => s && slugs.includes(s)) ?? null
    target.current = initial
    if (initial) hydrate(initial)
    ready.current = true
  }, [slugs, hydrate])

  // Side effects live here, never in the reducer (Q2).
  useEffect(() => {
    if (!ready.current || !currentSlug) return
    // The pre-hydrate render's effect still sees the default role; don't write it.
    if (target.current && target.current !== currentSlug) return
    target.current = null
    try {
      localStorage.setItem(STORAGE_KEY, currentSlug)
    } catch {
      /* storage unavailable (private mode, blocked) */
    }
    if (location.hash.slice(1) !== currentSlug) history.replaceState(null, '', `#${currentSlug}`)
  }, [currentSlug])

  // Deep links and the 1..n shortcuts.
  useEffect(() => {
    const onHash = () => select(location.hash.slice(1))
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      const n = Number(e.key)
      const slug = Number.isInteger(n) && n >= 1 ? slugs[n - 1] : undefined
      if (slug) select(slug)
    }
    addEventListener('hashchange', onHash)
    document.addEventListener('keydown', onKey)
    return () => {
      removeEventListener('hashchange', onHash)
      document.removeEventListener('keydown', onKey)
    }
  }, [slugs, select])
}
