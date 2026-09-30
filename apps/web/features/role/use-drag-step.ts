'use client'
import { useRef, type MouseEvent, type PointerEvent } from 'react'

/**
 * Drag to step, for touch: one step per `rowPx` of vertical travel, dragging up
 * moves forward. The pointer is captured only once the drag has stepped, so a
 * plain click still reaches the row under it; the click that ends a drag is
 * swallowed so it does not also jump.
 */
export function useDragStep(step: (delta: number) => void, rowPx: number) {
  const drag = useRef<{ id: number; y: number; stepped: number } | null>(null)
  const dragged = useRef(false)

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    drag.current = { id: e.pointerId, y: e.clientY, stepped: 0 }
    dragged.current = false
  }
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const target = Math.round((d.y - e.clientY) / rowPx)
    if (target === d.stepped) return
    if (!dragged.current) {
      dragged.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    step(target - d.stepped)
    d.stepped = target
  }
  const onPointerEnd = () => {
    drag.current = null
  }
  const onClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!dragged.current) return
    dragged.current = false
    e.stopPropagation()
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onClickCapture,
  }
}
