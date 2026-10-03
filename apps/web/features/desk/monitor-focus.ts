export interface MonitorFocus {
  /** The pointer is over the screen. */
  over: boolean
  /** A button pressed on the screen is still held (possibly dragged off it). */
  pressed: boolean
  /** The screen has keyboard focus. */
  focused: boolean
}

export type MonitorEvent = 'enter' | 'leave' | 'press' | 'release' | 'focus' | 'blur'

export const UNFOCUSED: MonitorFocus = { over: false, pressed: false, focused: false }

export function reduceMonitorFocus(state: MonitorFocus, event: MonitorEvent): MonitorFocus {
  switch (event) {
    case 'enter':
      return { ...state, over: true }
    case 'leave':
      return { ...state, over: false }
    case 'press':
      return { ...state, pressed: true }
    case 'release':
      return { ...state, pressed: false }
    case 'focus':
      return { ...state, focused: true }
    case 'blur':
      return { ...state, focused: false }
  }
}

/** The camera should be at the monitor: hovering, mid-drag, or focused by keyboard. */
export const wantsMonitor = (state: MonitorFocus): boolean => state.over || state.pressed || state.focused
