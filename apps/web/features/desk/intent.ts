import type { IntentSource } from './power'

/** On touch, the monitor counts as approached once this much of the figure box is in view. */
export const VISIBLE_RATIO = 0.5

/**
 * A touch device: its primary pointer is coarse and cannot hover (Media Queries 4's description of a
 * touchscreen: phones, tablets). `(hover: none)` alone is not touch: a device with no pointing device
 * at all matches it too (`pointer: none`), and that is headless Chromium on Linux, which is what
 * PageSpeed Insights and CI's Lighthouse run, as well as kiosks and keyboard-only setups. Taken for
 * touch, they booted the OS at load with nobody approaching it. They take the pointer path instead,
 * where keyboard focus on the screen boots it. A laptop with a touchscreen and a trackpad has a fine
 * primary pointer that hovers, so it is a pointer device too. `DeskScene.module.css` uses this query.
 */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'

/** Read once: a device does not gain or lose its primary input while the page is open. */
export const isTouchDevice = (matchMedia: (query: string) => MediaQueryList = window.matchMedia.bind(window)): boolean =>
  matchMedia(TOUCH_QUERY).matches

/**
 * Calls `onApproach` once, as the visitor approaches the monitor. With a pointer: the mouse or pen
 * entering the figure box (well before it reaches the screen, so the OS boots during the approach
 * and not during the zoom). On touch (`isTouchDevice`), which has no hover: the monitor half in view, at once, so the
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
