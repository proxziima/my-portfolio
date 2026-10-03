export interface WindowState {
  zIndex: number
  minimized: boolean
}

export interface WindowManager {
  windows: Record<string, WindowState>
  /** The highest z-index issued so far; raising a window takes the next one. */
  top: number
}

export type WindowAction =
  | { type: 'open'; id: string }
  | { type: 'close'; id: string }
  | { type: 'minimize'; id: string }
  | { type: 'focus'; id: string }
  /** A taskbar tab: restore when minimised, minimise when active, raise otherwise. */
  | { type: 'taskbar'; id: string }
  | { type: 'reset' }

export const EMPTY_WINDOWS: WindowManager = { windows: {}, top: 0 }

const raise = (state: WindowManager, id: string): WindowManager => ({
  top: state.top + 1,
  windows: { ...state.windows, [id]: { zIndex: state.top + 1, minimized: false } },
})

/** The front-most window that is not minimised. */
export function activeWindow(state: WindowManager): string | undefined {
  let best: string | undefined
  let z = 0
  for (const [id, w] of Object.entries(state.windows)) {
    if (!w.minimized && w.zIndex > z) {
      z = w.zIndex
      best = id
    }
  }
  return best
}

export function windowReducer(state: WindowManager, action: WindowAction): WindowManager {
  switch (action.type) {
    case 'open':
      return raise(state, action.id)
    case 'focus':
      return state.windows[action.id] ? raise(state, action.id) : state
    case 'close': {
      const { [action.id]: _closed, ...windows } = state.windows
      return { ...state, windows }
    }
    case 'minimize': {
      const w = state.windows[action.id]
      return w ? { ...state, windows: { ...state.windows, [action.id]: { ...w, minimized: true } } } : state
    }
    case 'taskbar': {
      const w = state.windows[action.id]
      if (!w) return state
      if (w.minimized || activeWindow(state) !== action.id) return raise(state, action.id)
      return windowReducer(state, { type: 'minimize', id: action.id })
    }
    case 'reset':
      return EMPTY_WINDOWS
  }
}
