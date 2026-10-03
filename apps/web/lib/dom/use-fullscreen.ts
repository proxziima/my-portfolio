'use client'
import { useCallback, useEffect, useState, type RefObject } from 'react'

export interface Fullscreen {
  on: boolean
  enter: () => void
  exit: () => void
  toggle: () => void
}

/**
 * Full-screen state for one element. `on` drives the CSS (the element is styled to cover the
 * viewport by its owner); where the browser has the Fullscreen API the element also goes truly
 * full screen, so the browser chrome leaves too. Leaving native full screen by any route (Esc, a
 * tab switch) turns `on` off, and Escape exits in both modes. While on, `<html data-fullscreen>`
 * lets the stylesheet lock page scroll.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>): Fullscreen {
  const [on, setOn] = useState(false)

  const enter = useCallback(() => {
    setOn(true)
    // not every browser has it (iOS Safari), and a user-gesture check can reject: the CSS mode stands alone
    ref.current?.requestFullscreen?.().catch(() => {})
  }, [ref])

  const exit = useCallback(() => {
    setOn(false)
    if (document.fullscreenElement && document.fullscreenElement === ref.current) void document.exitFullscreen().catch(() => {})
  }, [ref])

  const toggle = useCallback(() => (on ? exit() : enter()), [on, enter, exit])

  useEffect(() => {
    if (!on) return
    document.documentElement.dataset.fullscreen = 'true'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exit()
    }
    // the browser left full screen on its own (Esc handled natively, app switch): follow it
    const onChange = () => {
      if (document.fullscreenElement !== ref.current) setOn(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onChange)
    // the OS on the monitor is a same-origin iframe: a key pressed while it has focus never reaches this document
    const frames: Window[] = []
    for (const frame of ref.current?.querySelectorAll('iframe') ?? []) {
      try {
        const win = frame.contentWindow
        if (!win) continue
        win.addEventListener('keydown', onKey)
        frames.push(win)
      } catch {
        /* cross-origin */
      }
    }
    return () => {
      delete document.documentElement.dataset.fullscreen
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onChange)
      for (const win of frames) {
        try {
          win.removeEventListener('keydown', onKey)
        } catch {
          /* cross-origin */
        }
      }
    }
  }, [on, exit, ref])

  return { on, enter, exit, toggle }
}
