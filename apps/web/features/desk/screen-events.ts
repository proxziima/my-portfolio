import { reduceMonitorFocus, UNFOCUSED, wantsMonitor, type MonitorEvent } from './monitor-focus'

/** A press or key inside the screen, for the scene's sounds. */
export interface ScreenInput {
  type: 'pointerdown' | 'pointerup' | 'keydown' | 'keyup'
  key: string
  repeat: boolean
}

/**
 * Feeds `monitor-focus` from the screen and calls `onChange` whenever the answer flips. Pointer
 * enter/leave and focus come from the screen slab, which exists before the OS does (powered off, it
 * is the tab stop; hovering it zooms as hovering the OS does), and keep coming from it once the
 * iframe is inside: they fire in the parent document even for a cross-origin frame. Focus moving
 * from the slab into its own iframe (the hand-over when the OS loads) is one stay, not a leave.
 * Presses are only visible inside the frame's own window, which is reachable because the OS is
 * same-origin; a cross-origin frame simply loses the drag guard. That window is bound on every load
 * of an iframe in the slab, so an OS that powers on later is heard too. A cancelled press (native
 * drag, context menu) fires `pointercancel` instead of `pointerup` and releases as well. The same
 * inner window also feeds `onInput` with presses and keys, so the scene can play its keyboard and
 * mouse sounds for what happens inside the OS.
 */
export function watchScreen(
  element: HTMLElement,
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

  /** Per iframe, the listeners on its current window: a load replaces them, so none is bound twice. */
  const inners = new Map<HTMLIFrameElement, () => void>()
  const watchInner = (iframe: HTMLIFrameElement) => {
    inners.get(iframe)?.()
    inners.delete(iframe)
    const inner = iframe.contentWindow
    if (!inner) return
    const bound: (() => void)[] = []
    const onInner = (type: string, handler: (e: Event) => void) => {
      inner.addEventListener(type, handler)
      bound.push(() => {
        try {
          inner.removeEventListener(type, handler)
        } catch {
          /* the window is gone */
        }
      })
    }
    try {
      onInner('pointerdown', () => {
        send('press')
        onInput?.({ type: 'pointerdown', key: '', repeat: false })
      })
      onInner('pointerup', () => {
        send('release')
        onInput?.({ type: 'pointerup', key: '', repeat: false })
      })
      onInner('pointercancel', () => send('release'))
      onInner('keydown', keyInput('keydown'))
      onInner('keyup', keyInput('keyup'))
    } catch {
      /* cross-origin: no drag guard */
    }
    inners.set(iframe, () => bound.forEach((off) => off()))
  }

  on(element, 'pointerenter', () => send('enter'))
  on(element, 'pointerleave', () => send('leave'))
  on(element, 'focusin', () => {
    if (keyboardFocus()) send('focus')
  })
  on(element, 'focusout', (e) => {
    // still inside the screen (the slab handing focus to the OS it holds): not a blur
    const next = (e as FocusEvent).relatedTarget
    if (next instanceof Node && element.contains(next)) return
    send('blur')
  })
  on(window, 'pointerup', () => send('release'))
  on(window, 'pointercancel', () => send('release'))
  // `load` does not bubble, but it passes the slab while capturing: every iframe load inside, now or later
  const onLoad = (e: Event) => {
    if (e.target instanceof HTMLIFrameElement) watchInner(e.target)
  }
  element.addEventListener('load', onLoad, true)
  offs.push(() => element.removeEventListener('load', onLoad, true))

  return () => {
    for (const off of offs) off()
    offs.length = 0
    for (const off of inners.values()) off()
    inners.clear()
  }
}
