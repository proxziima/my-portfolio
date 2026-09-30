'use client'
import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { PickerRows } from './PickerRows'
import { useRole } from './RoleProvider'
import { useDragStep } from './use-drag-step'
import { useWheelStep } from './use-wheel-step'
import styles from './RolePicker.module.css'

/** Keep in sync with --picker-row. */
const ROW = 42
const SOFT_CLOSE_MS = 160
const KEY_STEP: Partial<Record<string, -1 | 1>> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }

interface Props {
  drumRef: RefObject<HTMLButtonElement | null>
  open: boolean
  onOpenChange: (open: boolean) => void
  hint: string
  children: ReactNode
}

/**
 * The role as a short wheel over the drum. Drum controls are React handlers on
 * the wrapper (they bubble from the drum), so they always see the current `open`.
 */
export function RolePicker({ drumRef, open, onOpenChange, hint, children }: Props) {
  const { disciplines, position, step, animate } = useRole()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef(0)
  // After a click closes the picker, hovering must not reopen it until the pointer leaves.
  const suppressHover = useRef(false)
  // `open` when the pointer pressed the drum: a touch tap opens on the compat
  // mouseenter/focus before its click, and that click must not close it again.
  const openAtPress = useRef<boolean | null>(null)

  const openNow = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    onOpenChange(true)
  }, [onOpenChange])
  const hide = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    onOpenChange(false)
  }, [onOpenChange])
  const softHide = () => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(hide, SOFT_CLOSE_MS)
  }

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  // The whole wrapper (drum, rows and hint) takes the wheel while open (Q1).
  useWheelStep(wrapRef, open, step)
  const drag = useDragStep(step, ROW)

  // A click outside closes.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!(e.target instanceof Node) || !wrapRef.current?.contains(e.target)) hide()
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [open, hide])

  const inDrum = (target: EventTarget) => target instanceof Node && !!drumRef.current?.contains(target)

  return (
    <span
      ref={wrapRef}
      className={styles.wrap}
      data-open={open}
      data-anchor="role"
      onMouseEnter={() => {
        window.clearTimeout(closeTimer.current)
        if (!suppressHover.current) onOpenChange(true)
      }}
      onMouseLeave={() => {
        suppressHover.current = false
        softHide()
      }}
      onFocus={(e) => {
        if (inDrum(e.target)) openNow()
      }}
      onBlur={(e) => {
        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) softHide()
      }}
      onPointerDown={(e) => {
        if (inDrum(e.target)) openAtPress.current = open
      }}
      onClick={(e) => {
        if (!inDrum(e.target)) return
        // keyboard clicks (detail 0) toggle the current state
        const wasOpen = e.detail === 0 || openAtPress.current === null ? open : openAtPress.current
        openAtPress.current = null
        suppressHover.current = wasOpen
        if (wasOpen) hide()
        else openNow()
      }}
      onKeyDown={(e) => {
        if (!inDrum(e.target)) return
        const dir = KEY_STEP[e.key]
        if (dir) {
          e.preventDefault()
          openNow()
          step(dir)
        } else if (e.key === 'Escape') hide()
      }}
    >
      {children}
      <span
        className={styles.wheel}
        role="listbox"
        aria-label="Choose a role"
        hidden={!open}
        // keep focus on the drum, so clicking a row does not blur-close the picker
        onMouseDown={(e) => e.preventDefault()}
      >
        <span className={styles.window} {...drag}>
          <span className={styles.selection} aria-hidden="true" />
          <PickerRows
            disciplines={disciplines}
            position={position}
            animate={animate}
            onPick={(offset) => (offset === 0 ? hide() : step(offset))}
          />
        </span>
        <span className={styles.hint} aria-hidden="true">
          <svg width="8" height="11" viewBox="0 0 9 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4.5 1.4v9.2M1.6 4.3 4.5 1.2l2.9 3.1M1.6 7.7l2.9 3.1 2.9-3.1" />
          </svg>
          {hint}
        </span>
      </span>
    </span>
  )
}
