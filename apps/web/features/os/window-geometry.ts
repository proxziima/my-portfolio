export interface Size { width: number; height: number }
export interface Rect extends Size { x: number; y: number }

export const TASKBAR_HEIGHT = 32
export const MIN_SIZE: Size = { width: 240, height: 160 }
/** How much of a window must stay on the desk so its title bar can always be grabbed. */
const GRAB = 48
const FILL_MARGIN = { x: 56, y: 24 }

/** The desk area above the taskbar. */
const desk = (bounds: Size): Size => ({ width: bounds.width, height: bounds.height - TASKBAR_HEIGHT })

export function clampRect(rect: Rect, bounds: Size): Rect {
  const area = desk(bounds)
  const width = Math.max(MIN_SIZE.width, Math.min(rect.width, area.width))
  const height = Math.max(MIN_SIZE.height, Math.min(rect.height, area.height))
  const x = Math.min(Math.max(rect.x, GRAB - width), area.width - GRAB)
  const y = Math.min(Math.max(rect.y, 0), area.height - 24)
  return { x, y, width, height }
}

/** Where a window opens: filling the desk with a margin, or centred at `size`. */
export function initialRect(bounds: Size, size?: Size): Rect {
  const area = desk(bounds)
  if (!size) {
    return clampRect({ x: FILL_MARGIN.x, y: FILL_MARGIN.y, width: area.width - 2 * FILL_MARGIN.x, height: area.height - 3 * FILL_MARGIN.y }, bounds)
  }
  // centre the size as it will end up on this desk, so an oversized window starts flush at the edge
  const width = Math.min(size.width, area.width)
  const height = Math.min(size.height, area.height)
  return clampRect({ x: (area.width - width) / 2, y: (area.height - height) / 2, width, height }, bounds)
}
