import { describe, expect, it } from 'vitest'
import { activeWindow, EMPTY_WINDOWS, windowReducer, type WindowManager } from '@/features/os/window-manager'

const open = (state: WindowManager, ...ids: string[]) => ids.reduce((s, id) => windowReducer(s, { type: 'open', id }), state)

describe('windowReducer', () => {
  it('opens windows on top of each other', () => {
    const s = open(EMPTY_WINDOWS, 'a', 'b')
    expect(s.windows.a).toEqual({ zIndex: 1, minimized: false })
    expect(s.windows.b).toEqual({ zIndex: 2, minimized: false })
    expect(activeWindow(s)).toBe('b')
  })

  it('opening an open window raises it and restores it', () => {
    let s = open(EMPTY_WINDOWS, 'a', 'b')
    s = windowReducer(s, { type: 'minimize', id: 'a' })
    s = windowReducer(s, { type: 'open', id: 'a' })
    expect(s.windows.a).toEqual({ zIndex: 3, minimized: false })
    expect(activeWindow(s)).toBe('a')
  })

  it('focusing the window already on top changes nothing', () => {
    const s = open(EMPTY_WINDOWS, 'a', 'b')
    expect(windowReducer(s, { type: 'focus', id: 'b' })).toBe(s)
  })

  it('focus raises; focusing a missing window is a no-op', () => {
    const s = open(EMPTY_WINDOWS, 'a', 'b')
    expect(activeWindow(windowReducer(s, { type: 'focus', id: 'a' }))).toBe('a')
    expect(windowReducer(s, { type: 'focus', id: 'zzz' })).toBe(s)
  })

  it('minimize hides the window from the active choice', () => {
    const s = windowReducer(open(EMPTY_WINDOWS, 'a', 'b'), { type: 'minimize', id: 'b' })
    expect(s.windows.b?.minimized).toBe(true)
    expect(activeWindow(s)).toBe('a')
  })

  it('close removes the window', () => {
    const s = windowReducer(open(EMPTY_WINDOWS, 'a'), { type: 'close', id: 'a' })
    expect(s.windows).toEqual({})
    expect(activeWindow(s)).toBeUndefined()
  })

  it('taskbar: minimised → restore, active → minimise, behind → raise', () => {
    let s = open(EMPTY_WINDOWS, 'a', 'b')
    s = windowReducer(s, { type: 'taskbar', id: 'b' }) // b is active
    expect(s.windows.b?.minimized).toBe(true)
    s = windowReducer(s, { type: 'taskbar', id: 'b' }) // b is minimised
    expect(s.windows.b).toEqual({ zIndex: 3, minimized: false })
    s = windowReducer(s, { type: 'taskbar', id: 'a' }) // a is behind
    expect(activeWindow(s)).toBe('a')
    expect(s.windows.a?.minimized).toBe(false)
  })

  it('reset empties everything', () => {
    expect(windowReducer(open(EMPTY_WINDOWS, 'a'), { type: 'reset' })).toEqual(EMPTY_WINDOWS)
  })
})
