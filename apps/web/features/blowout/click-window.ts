/** The blowout's trigger: ten switch clicks inside four seconds, with the filament complaining from the sixth. */
const WINDOW_MS = 4000
const NEEDED = 10
const WARN = 6
const MAX_LEVEL = 4

export type ClickResult =
  | { kind: 'quiet' }
  | { kind: 'preload' }
  | { kind: 'flicker'; level: number }
  | { kind: 'blow' }

export function createClickWindow() {
  let clicks: number[] = []
  return {
    register(now: number): ClickResult {
      clicks = [...clicks.filter((t) => now - t <= WINDOW_MS), now]
      if (clicks.length >= NEEDED) {
        clicks = []
        return { kind: 'blow' }
      }
      if (clicks.length >= WARN) return { kind: 'flicker', level: Math.min(MAX_LEVEL, clicks.length - WARN + 1) }
      if (clicks.length >= 2) return { kind: 'preload' }
      return { kind: 'quiet' }
    },
    reset() {
      clicks = []
    },
  }
}
