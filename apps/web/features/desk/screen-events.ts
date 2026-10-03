import { reduceMonitorFocus, UNFOCUSED, wantsMonitor, type MonitorEvent } from './monitor-focus'

/**
 * Feeds `monitor-focus` from the screen's iframe and calls `onChange` whenever the answer flips.
 * Pointer enter/leave and focus come from the iframe element itself (they fire in the parent
 * document even for a cross-origin frame). Presses are only visible inside the frame's own window,
 * which is reachable because the OS is same-origin; a cross-origin frame simply loses the drag guard.
 */
export function watchScreen(iframe: HTMLIFrameElement, onChange: (wantsMonitor: boolean) => void): () => void {
  let state = UNFOCUSED
  let last = false
  const offs: (() => void)[] = []

  const send = (event: MonitorEvent) => {
    state = reduceMonitorFocus(state, event)
    const want = wantsMonitor(state)
    if (want === last) return
    last = want
    onChange(want)
  }

  const on = (target: EventTarget, type: string, handler: () => void) => {
    target.addEventListener(type, handler)
    offs.push(() => target.removeEventListener(type, handler))
  }

  // a click into the frame focuses it too, but then the pointer already says so: focus only counts
  // when it arrives with the pointer elsewhere (Tab), so leaving by mouse always zooms back out
  const keyboardFocus = () => !state.over

  const watchInner = () => {
    const inner = iframe.contentWindow
    if (!inner) return
    try {
      on(inner, 'pointerdown', () => send('press'))
      on(inner, 'pointerup', () => send('release'))
    } catch {
      /* cross-origin: no drag guard */
    }
  }

  on(iframe, 'pointerenter', () => send('enter'))
  on(iframe, 'pointerleave', () => send('leave'))
  on(iframe, 'focus', () => {
    if (keyboardFocus()) send('focus')
  })
  on(iframe, 'blur', () => send('blur'))
  on(window, 'pointerup', () => send('release'))
  on(iframe, 'load', watchInner)

  return () => {
    for (const off of offs) off()
    offs.length = 0
  }
}
