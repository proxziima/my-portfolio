'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

const ON_RESIZE_MS = 120
const ON_MAIN_RESIZE_MS = 80
/** after a role change: the bio morph swaps at 240ms and its words settle by ~450ms */
const AFTER_MORPH_MS = 450

/**
 * The self-healing contract (spec §6.6): a counter that bumps whenever the layout may have moved:
 * window resize, `main` resizing (lists cross-fading, the figure collapsing, the host sizing the page),
 * the root box changing (a scrollbar re-centring the column), web fonts arriving, and `settleKey`
 * changing (the role). `request(ms)` asks for another pass, e.g. while `main` has no width yet.
 * Bumps are debounced into one.
 */
export function useLayoutSignal(enabled: boolean, settleKey: string): [tick: number, request: (delayMs: number) => void] {
  const [tick, setTick] = useState(0)
  const timer = useRef(0)

  const request = useCallback((delayMs: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setTick((t) => t + 1), delayMs)
  }, [])

  useEffect(() => {
    if (!enabled) return
    let live = true
    const onResize = () => request(ON_RESIZE_MS)
    const ro = new ResizeObserver(() => request(ON_MAIN_RESIZE_MS))
    const main = document.querySelector('main')
    if (main) ro.observe(main)
    // the root too: a scrollbar appearing re-centres `main` without resizing it
    ro.observe(document.documentElement)
    addEventListener('resize', onResize)
    void document.fonts?.ready.then(() => { if (live) request(0) })
    return () => {
      live = false
      window.clearTimeout(timer.current)
      ro.disconnect()
      removeEventListener('resize', onResize)
    }
  }, [enabled, request])

  // its own timer, so a resize burst can't pull the pass forward into the middle of the morph
  useEffect(() => {
    if (!enabled) return
    const settle = window.setTimeout(() => setTick((t) => t + 1), AFTER_MORPH_MS)
    return () => window.clearTimeout(settle)
  }, [enabled, settleKey])

  return [tick, request]
}
