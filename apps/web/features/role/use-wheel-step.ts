'use client'
import { useEffect, type RefObject } from 'react'

const THRESHOLD = 26
const COOLDOWN_MS = 170

/** Pure part: sums deltaY and emits one step per THRESHOLD, at most once per cooldown. */
export function createWheelAccumulator() {
  let acc = 0
  let coolUntil = 0
  return {
    push(deltaY: number, now: number): -1 | 0 | 1 {
      acc += deltaY
      if (now < coolUntil || Math.abs(acc) < THRESHOLD) return 0
      const dir = acc > 0 ? 1 : -1
      acc = 0
      coolUntil = now + COOLDOWN_MS
      return dir
    },
  }
}

/**
 * Native, non-passive wheel listener on `ref` while `enabled`. React's onWheel is
 * passive, so its preventDefault is ignored and the page scrolls (Q1).
 */
export function useWheelStep(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onStep: (dir: -1 | 1) => void,
) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const acc = createWheelAccumulator()
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const dir = acc.push(e.deltaY, performance.now())
      if (dir) onStep(dir)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, enabled, onStep])
}
