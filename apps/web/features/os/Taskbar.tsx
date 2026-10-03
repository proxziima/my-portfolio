'use client'
import { useEffect, useRef, useState } from 'react'
import type { ResolvedApp } from './apps'
import bevel from './bevel.module.css'
import { Icon } from './icons'
import type { WindowManager } from './window-manager'
import styles from './Taskbar.module.css'

const CLOCK_MS = 30_000
const timeNow = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** Minute-precision clock; only ever rendered on the client (after the boot screen). */
function useClock(): string {
  const [time, setTime] = useState(timeNow)
  useEffect(() => {
    const id = window.setInterval(() => setTime(timeNow()), CLOCK_MS)
    return () => window.clearInterval(id)
  }, [])
  return time
}

interface Props {
  apps: readonly ResolvedApp[]
  windows: WindowManager
  active: string | undefined
  onTab: (id: string) => void
  onShutdown: () => void
}

export function Taskbar({ apps, windows, active, onTab, onShutdown }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const startRef = useRef<HTMLDivElement>(null)
  const time = useClock()

  // the Start menu closes on any press outside it, like the real one, and on Escape
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: PointerEvent) => {
      if (!startRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [menuOpen])

  return (
    <nav className={`${styles.bar} ${bevel.raised}`} aria-label="Taskbar">
      <div ref={startRef} className={styles.start}>
        <button type="button" className={`${styles.startButton} ${menuOpen ? bevel.pressed : bevel.raised}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          <Icon name="flag" size={16} />
          <b>Start</b>
        </button>
        {menuOpen && (
          <div className={`${styles.menu} ${bevel.raised}`} role="menu">
            <div className={styles.menuBand} aria-hidden="true">Desktop</div>
            <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setMenuOpen(false); onShutdown() }}>
              <Icon name="computer" size={24} />
              Shut down…
            </button>
          </div>
        )}
      </div>
      <div className={styles.tabs}>
        {apps.map((app) => {
          const w = windows.windows[app.id]
          if (!w) return null
          const pressed = active === app.id && !w.minimized
          return (
            <button key={app.id} type="button" className={`${styles.tab} ${pressed ? bevel.pressed : bevel.raised}`} aria-pressed={pressed} onClick={() => onTab(app.id)}>
              <Icon name={app.icon} size={16} />
              <span>{app.title}</span>
            </button>
          )
        })}
      </div>
      <div className={`${styles.tray} ${bevel.sunken}`}>
        <time>{time}</time>
      </div>
    </nav>
  )
}
