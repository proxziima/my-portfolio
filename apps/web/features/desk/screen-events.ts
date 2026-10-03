import { reduceMonitorFocus, UNFOCUSED, wantsMonitor, type MonitorEvent } from './monitor-focus'

/** A press or key inside the screen, for the scene's sounds. */
export interface ScreenInput {
  type: 'pointerdown' | 'pointerup' | 'keydown' | 'keyup'
  key: string
  repeat: boolean
}

/**
 * Feeds `monitor-focus` from the screen's iframe and calls `onChange` whenever the answer flips.
 * Pointer enter/leave and focus come from the iframe element itself (they fire in the parent
 * document even for a cross-origin frame). Presses are only visible inside the frame's own window,
 * which is reachable because the OS is same-origin; a cross-origin frame simply loses the drag guard.
 * A cancelled press (native drag, context menu) fires `pointercancel` instead of `pointerup` and
 * releases as well. The same inner window also feeds `onInput` with presses and keys, so the scene
 * can play its keyboard and mouse sounds for what happens inside the OS.
 */
export function watchScreen(
  iframe: HTMLIFrameElement,
  onChange: (wantsMonitor: boolean) => void,
  onInput?: (input: ScreenInput) => void,
): () => void {
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

  const on = (target: EventTarget, type: string, handler: (e: Event) => void) => {
    target.addEventListener(type, handler)
    offs.push(() => target.removeEventListener(type, handler))
  }

  // a click into the frame focuses it too, but then the pointer already says so: focus only counts
  // when it arrives with the pointer elsewhere (Tab), so leaving by mouse always zooms back out
  const keyboardFocus = () => !state.over

  const keyInput = (type: 'keydown' | 'keyup') => (e: Event) => {
    const { key, repeat } = e as KeyboardEvent
    onInput?.({ type, key, repeat })
  }

  const watchInner = () => {
    const inner = iframe.contentWindow
    if (!inner) return
    try {
      on(inner, 'pointerdown', () => {
        send('press')
        onInput?.({ type: 'pointerdown', key: '', repeat: false })
      })
      on(inner, 'pointerup', () => {
        send('release')
        onInput?.({ type: 'pointerup', key: '', repeat: false })
      })
      on(inner, 'pointercancel', () => send('release'))
      on(inner, 'keydown', keyInput('keydown'))
      on(inner, 'keyup', keyInput('keyup'))
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
  on(window, 'pointercancel', () => send('release'))
  on(iframe, 'load', watchInner)

  return () => {
    for (const off of offs) off()
    offs.length = 0
  }
}
