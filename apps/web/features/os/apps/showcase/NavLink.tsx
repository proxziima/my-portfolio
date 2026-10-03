'use client'
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'

interface Props {
  label: string
  current?: boolean
  onNavigate: () => void
}

/** How long the label flashes red before the page changes, as the reference's Link. */
const PRESS_MS = 100

/**
 * The reference's router Link: a bold, underlined uppercase h4 that goes red on press and leaves a
 * ring before the current page. A button, since the Showcase's pages are state rather than routes.
 */
export function NavLink({ label, current = false, onNavigate }: Props) {
  const [pressed, setPressed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  // the reference acts on mouse down, then navigates once the red flash is over
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    setPressed(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setPressed(false)
      if (!current) onNavigate()
    }, PRESS_MS)
  }
  // a keyboard activation has no pointer down before it (detail 0): navigate straight away
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0 && !current) onNavigate()
  }

  return (
    <button
      type="button"
      className="navLink"
      aria-current={current ? 'page' : undefined}
      data-pressed={pressed}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {current && <span className="hereIndicator" aria-hidden="true" />}
      <span className="navLinkText">{label}</span>
    </button>
  )
}
