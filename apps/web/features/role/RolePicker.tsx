'use client'
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { mod } from './role-cycle'
import { useRole } from './RoleProvider'
import { useDragStep } from './use-drag-step'
import { useWheelStep } from './use-wheel-step'
import styles from './RolePicker.module.css'

/** Keep in sync with --picker-row. */
const ROW = 42
const SOFT_CLOSE_MS = 160
/** Rows rendered around the current position: 3 visible plus one masked on each side. */
const WINDOW = [-2, -1, 0, 1, 2]

interface Props {
  drumRef: RefObject<HTMLButtonElement | null>
  open: boolean
  onOpenChange: (open: boolean) => void
  hint: string
  children: ReactNode
}

/**
 * The role as a short wheel. Rows are a virtual window keyed by their unbounded
 * position, so React keeps each row across steps and its transform transitions:
 * the list rolls forever with no renormalising.
 */
export function RolePicker({ drumRef, open, onOpenChange, hint, children }: Props) {
  const { disciplines, position, step, animate } = useRole()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef(0)
  // After a click closes the picker, hovering must not reopen it until the pointer leaves.
  const suppressHover = useRef(false)

  const show = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    if (!suppressHover.current) onOpenChange(true)
  }, [onOpenChange])
  const hide = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    onOpenChange(false)
  }, [onOpenChange])
  const softHide = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(hide, SOFT_CLOSE_MS)
  }, [hide])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  // The whole wrapper (drum, rows and hint) takes the wheel while open (Q1).
  useWheelStep(wrapRef, open, step)
  const drag = useDragStep(step, ROW)

  // Drum: click toggles, arrows step, Escape closes.
  useEffect(() => {
    const drum = drumRef.current
    if (!drum) return
    const onClick = () => {
      if (open) {
        hide()
        suppressHover.current = true
      } else {
        suppressHover.current = false
        show()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      const dir =
        e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
      if (dir) {
        e.preventDefault()
        show()
        step(dir)
      } else if (e.key === 'Escape') hide()
    }
    drum.addEventListener('click', onClick)
    drum.addEventListener('keydown', onKey)
    drum.addEventListener('focus', show)
    return () => {
      drum.removeEventListener('click', onClick)
      drum.removeEventListener('keydown', onKey)
      drum.removeEventListener('focus', show)
    }
  }, [drumRef, open, show, hide, step])

  // A click outside closes.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!(e.target instanceof Node) || !wrapRef.current?.contains(e.target)) hide()
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [open, hide])

  return (
    <span
      ref={wrapRef}
      className={styles.wrap}
      data-open={open}
      data-anchor="role"
      onMouseEnter={show}
      onMouseLeave={() => {
        suppressHover.current = false
        softHide()
      }}
      onBlur={(e) => {
        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) softHide()
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
          {WINDOW.map((offset) => {
            const p = position + offset
            const d = disciplines[mod(p, disciplines.length)]!
            return (
              <span
                key={p}
                role="option"
                aria-selected={offset === 0}
                aria-hidden={Math.abs(offset) > 1 || undefined}
                className={styles.row}
                data-current={offset === 0}
                data-animate={animate}
                style={{ '--offset': offset } as CSSProperties}
                onClick={() => (offset === 0 ? hide() : step(offset))}
              >
                <span className={styles.name}>{d.title}</span>
                <span className={styles.meta}>{d.level}</span>
              </span>
            )
          })}
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
