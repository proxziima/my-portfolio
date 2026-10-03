'use client'
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { clampRect, initialRect, TASKBAR_HEIGHT, type Rect, type Size } from './window-geometry'

type Mode = 'move' | 'resize'

/**
 * A window's rect: placed on mount from the desk's measured size, moved and resized with pointer
 * capture, maximised to the desk. `bounds` and `size` must be referentially stable; a new identity
 * re-places the window. `aspect` (content width / height) opens it as tall as the desk allows.
 */
export function useWindowGeometry(size: Size | undefined, bounds: () => Size, aspect?: number) {
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 })
  const [maximized, setMaximized] = useState(false)
  // the rect is mirrored in a ref so a gesture can start from the latest one without re-subscribing
  const latest = useRef(rect)
  latest.current = rect
  const restore = useRef<Rect | null>(null)

  useLayoutEffect(() => {
    setRect(initialRect(bounds(), size, aspect))
  }, [bounds, size, aspect])

  const gesture = useCallback(
    (mode: Mode) => (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      const el = e.currentTarget
      const start = { x: e.clientX, y: e.clientY }
      const from = latest.current
      el.setPointerCapture(e.pointerId)
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - start.x
        const dy = ev.clientY - start.y
        const next = mode === 'move' ? { ...from, x: from.x + dx, y: from.y + dy } : { ...from, width: from.width + dx, height: from.height + dy }
        setRect(clampRect(next, bounds()))
      }
      const stop = () => {
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', stop)
        el.removeEventListener('pointercancel', stop)
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', stop)
      el.addEventListener('pointercancel', stop)
      e.preventDefault()
    },
    [bounds],
  )

  const toggleMaximize = useCallback(() => {
    if (maximized) {
      if (restore.current) setRect(restore.current)
    } else {
      restore.current = latest.current
    }
    setMaximized(!maximized)
  }, [maximized])

  const style: CSSProperties = maximized
    ? { left: 0, top: 0, width: '100%', height: `calc(100% - ${TASKBAR_HEIGHT}px)` }
    : { left: rect.x, top: rect.y, width: rect.width, height: rect.height }

  return {
    style,
    maximized,
    onMoveStart: maximized ? undefined : gesture('move'),
    onResizeStart: maximized ? undefined : gesture('resize'),
    toggleMaximize,
  }
}
