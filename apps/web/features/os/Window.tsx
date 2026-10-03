'use client'
import type { ReactNode } from 'react'
import bevel from './bevel.module.css'
import { Icon, type IconName } from './icons'
import { useWindowGeometry } from './use-window-geometry'
import type { Size } from './window-geometry'
import styles from './Window.module.css'

interface Props {
  title: string
  /** The status bar's text, like the reference's copyright line; defaults to the title. */
  status?: string
  icon: IconName
  active: boolean
  zIndex: number
  /** Minimised: kept mounted so the app's state survives. */
  hidden: boolean
  size?: Size
  bounds: () => Size
  onFocus: () => void
  onMinimize: () => void
  onClose: () => void
  children: ReactNode
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

export function Window({ title, status, icon,active, zIndex, hidden, size, bounds, onFocus, onMinimize, onClose, children }: Props) {
  const { style, maximized, onMoveStart, onResizeStart, toggleMaximize } = useWindowGeometry(size, bounds)
  return (
    <section
      role="dialog"
      aria-label={title}
      className={`${styles.window} ${bevel.raised}`}
      style={{ ...style, zIndex }}
      hidden={hidden}
      data-active={active}
      data-maximized={maximized}
      onPointerDownCapture={onFocus}
    >
      <header className={styles.title} onPointerDown={onMoveStart} onDoubleClick={toggleMaximize}>
        <Icon name={icon} size={16} />
        <span className={styles.titleText}>{title}</span>
        <span className={styles.controls} onPointerDown={stop} onDoubleClick={stop}>
          <button type="button" className={bevel.raised} aria-label={`Minimise ${title}`} onClick={onMinimize}><Icon name="minimize" size={12} /></button>
          <button type="button" className={bevel.raised} aria-label={maximized ? `Restore ${title}` : `Maximise ${title}`} onClick={toggleMaximize}><Icon name="maximize" size={12} /></button>
          <button type="button" className={bevel.raised} aria-label={`Close ${title}`} onClick={onClose}><Icon name="close" size={12} /></button>
        </span>
      </header>
      <div className={`${styles.content} ${bevel.sunken}`}>{children}</div>
      <footer className={styles.status}>
        <span className={bevel.sunken}>{status ?? title}</span>
        <span className={`${styles.grip} ${bevel.sunken}`} onPointerDown={onResizeStart} aria-hidden="true" />
      </footer>
    </section>
  )
}
