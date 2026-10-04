import type { KeyboardEvent } from 'react'

/** Enter opens, as a double click does: desktop shortcuts and Messenger contacts. */
export const enterOpens = (onOpen: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter') onOpen()
}
