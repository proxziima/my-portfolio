export interface PageRect { left: number; top: number; width: number; height: number; right: number; bottom: number }

/** An element's box in document coordinates (viewport rect plus scroll). */
export function pageRect(el: Element): PageRect {
  const r = el.getBoundingClientRect()
  return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height, right: r.right + scrollX, bottom: r.bottom + scrollY }
}
