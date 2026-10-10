import type { IntentSource } from './power'

/** On touch, the monitor counts as approached once this much of the figure box is in view. */
export const VISIBLE_RATIO = 0.5

/**
 * Calls `onApproach` once, as the visitor approaches the monitor. With a pointer: the mouse or pen
 * entering the figure box (well before it reaches the screen, so the OS boots during the approach
 * and not during the zoom). On touch, which has no hover: the monitor half in view, at once, so the
 * screen never sits dark while it is being looked at. Keyboard focus on the screen counts in both
 * modes. Returns the cleanup.
 */
export function watchApproach(box: HTMLElement, screen: HTMLElement, touch: boolean, onApproach: (source: IntentSource) => void): () => void {
  let done = false
  let io: IntersectionObserver | null = null
  const fire = (source: IntentSource) => {
    if (done) return
    done = true
    cleanup()
    onApproach(source)
  }
  const onEnter = (e: Event) => {
    const type = (e as PointerEvent).pointerType
    if (type === 'mouse' || type === 'pen') fire('pointer')
  }
  const onFocus = () => fire('focus')
  screen.addEventListener('focusin', onFocus)
  if (touch) {
    io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.intersectionRatio >= VISIBLE_RATIO)) fire('visible')
      },
      { threshold: [VISIBLE_RATIO] },
    )
    io.observe(box)
  } else {
    box.addEventListener('pointerenter', onEnter)
  }
  function cleanup() {
    box.removeEventListener('pointerenter', onEnter)
    screen.removeEventListener('focusin', onFocus)
    io?.disconnect()
  }
  return cleanup
}
