import type { MouseEvent } from 'react'

/** How a shortcut or a contact opens: a double click, or a keyboard / assistive-tech activation (Enter, Space, a screen reader's click — all clicks with detail 0). A single mouse click only selects. */
export const openGestures = (onOpen: () => void) => ({
  onDoubleClick: onOpen,
  onClick: (e: MouseEvent) => {
    if (e.detail === 0) onOpen()
  },
})
