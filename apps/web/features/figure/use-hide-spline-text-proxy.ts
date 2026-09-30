'use client'
import { useEffect } from 'react'

export const TEXT_PROXY_CLASS = 'spline-text-proxy'

/**
 * The Spline runtime's text inputs ("Click to type" on the monitor) capture keys through a proxy
 * `<textarea>` it appends to the body: `position: fixed; z-index: -1`, half opaque, red border, 40px
 * text. It assumes an opaque page above z-index -1; our background is painted on the root, so it
 * shows through. Recognised by those inline styles.
 */
export const isSplineTextProxy = (node: Node): node is HTMLTextAreaElement =>
  node instanceof HTMLTextAreaElement && node.style.position === 'fixed' && node.style.zIndex === '-1'

const mark = (node: Node) => {
  if (isSplineTextProxy(node)) node.classList.add(TEXT_PROXY_CLASS)
}

/**
 * While mounted, tags the runtime's proxy textarea so the global `.spline-text-proxy` rule hides it.
 * Visually only: it has to stay in the DOM and focusable to keep receiving the keystrokes.
 */
export function useHideSplineTextProxy(): void {
  useEffect(() => {
    document.body.childNodes.forEach(mark)
    const mo = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach(mark)
    })
    mo.observe(document.body, { childList: true })
    return () => mo.disconnect()
  }, [])
}
