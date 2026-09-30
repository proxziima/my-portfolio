'use client'
import { useEffect } from 'react'

/** The one place the class name lives; the rule that hides it is in SplineScene.module.css. */
export const TEXT_PROXY_CLASS = 'spline-text-proxy'
/** The proxy has no visible label; it stays in the tab order only as the runtime's focus target. */
export const TEXT_PROXY_LABEL = 'Scene text input'

/**
 * The Spline runtime's text inputs ("Click to type" on the monitor) capture keys through a proxy
 * `<textarea>` it appends to the body: `position: fixed; z-index: -1`, half opaque, red border, 40px
 * text. It assumes an opaque page above z-index -1; our background is painted on the root, so it
 * shows through. Recognised by those inline styles.
 */
export const isSplineTextProxy = (node: Node): node is HTMLTextAreaElement =>
  node instanceof HTMLTextAreaElement && node.style.position === 'fixed' && node.style.zIndex === '-1'

/**
 * Hidden and labelled, but never `aria-hidden`: the runtime focuses it, and focus must not land on
 * something assistive tech can't see. `tabindex=-1` keeps it out of the Tab order.
 */
const mark = (node: Node) => {
  if (!isSplineTextProxy(node)) return
  node.classList.add(TEXT_PROXY_CLASS)
  node.setAttribute('aria-label', TEXT_PROXY_LABEL)
  node.tabIndex = -1
}

/**
 * While mounted, tags the runtime's proxy textarea with `TEXT_PROXY_CLASS` so SplineScene's rule hides it.
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
