/**
 * Engaged time, GA4-style: wall-clock time on a page says little (a forgotten tab counts hours), so
 * time only accrues while the thing is on screen and the visitor did something in the last 30 s.
 */
export const IDLE_MS = 30_000

/** Input that shows a person is there. No mousemove: it fires on any passing cursor and is costly. */
const ACTIVITY_EVENTS = ['scroll', 'wheel', 'pointerdown', 'keydown', 'touchstart'] as const

export interface EngagementClock {
  /** Whether the tracked thing is on screen (section in view, document visible). */
  setActive(active: boolean): void
  /** The visitor interacted: restarts the idle window. */
  activity(): void
  /** Engaged seconds since creation or the last reset. */
  seconds(): number
  reset(): void
}

/**
 * A lazy engagement clock: no timers, every transition settles the time since the last one. While
 * idle, accrual stops at `lastActivity + IDLE_MS`. By default creation counts as an interaction:
 * loading the page is the visitor's latest act, so the first seconds on screen are engaged.
 * `engaged = false` starts idle, for a document that loads without the visitor asking (an iframe).
 */
export function createEngagementClock(now: () => number = () => performance.now(), engaged = true): EngagementClock {
  let active = false
  let settledAt = now()
  let lastActivity = engaged ? settledAt : -Infinity
  let total = 0
  const settle = () => {
    const t = now()
    if (active) total += Math.max(0, Math.min(t, lastActivity + IDLE_MS) - settledAt)
    settledAt = t
  }
  return {
    setActive(next) {
      settle()
      active = next
    },
    activity() {
      settle()
      lastActivity = settledAt
    },
    seconds() {
      settle()
      return total / 1000
    },
    reset() {
      settle()
      total = 0
    },
  }
}

/** Seconds as reported: one decimal, or null under a second (a fly-by scroll is not engagement). */
export function reportableSeconds(seconds: number): number | null {
  return seconds >= 1 ? Math.round(seconds * 10) / 10 : null
}

/** Calls `onActivity` on any visitor input on `target` (passive). Returns the uninstaller. */
export function installActivityListeners(onActivity: () => void, target: EventTarget = window): () => void {
  for (const type of ACTIVITY_EVENTS) target.addEventListener(type, onActivity, { passive: true, capture: true })
  return () => {
    for (const type of ACTIVITY_EVENTS) target.removeEventListener(type, onActivity, { capture: true })
  }
}

/**
 * Calls `flush` when the visit may end: the document hiding (tab switch, minimise, mobile app switch;
 * often the last reliable moment on mobile) and `pagehide` (close, navigation). Returns the uninstaller.
 */
export function onPageExit(flush: () => void): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', flush)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', flush)
  }
}
