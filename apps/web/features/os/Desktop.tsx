'use client'
import { useCallback, useReducer, useRef, useState } from 'react'
import type { Portfolio } from '@/lib/cms/types'
import { APPS, appTitle, BOOT_APP, type ResolvedApp } from './apps'
import { Boot } from './Boot'
import { Shortcut } from './Shortcut'
import { Shutdown } from './Shutdown'
import { Taskbar } from './Taskbar'
import { Window } from './Window'
import { activeWindow, EMPTY_WINDOWS, windowReducer } from './window-manager'
import styles from './Desktop.module.css'

type Phase = 'boot' | 'desktop' | 'shutdown'

/** The OS root: boot screen → desktop (windows, shortcuts, taskbar) → shutdown → boot again. */
export function Desktop({ data }: { data: Portfolio }) {
  const [phase, setPhase] = useState<Phase>('boot')
  const [wm, dispatch] = useReducer(windowReducer, EMPTY_WINDOWS)
  const deskRef = useRef<HTMLDivElement>(null)
  // the desk fills the viewport (html/body are 100%), so the viewport is the right answer before the
  // desk's ref is attached: a window in the desk's first commit lays out before the parent ref does
  const bounds = useCallback(
    () => ({ width: deskRef.current?.clientWidth ?? window.innerWidth, height: deskRef.current?.clientHeight ?? window.innerHeight }),
    [],
  )

  const boot = useCallback(() => {
    dispatch({ type: 'reset' })
    dispatch({ type: 'open', id: BOOT_APP })
    setPhase('desktop')
  }, [])
  const reboot = useCallback(() => setPhase('boot'), [])

  if (phase === 'boot') return <Boot name={data.profile.name} onDone={boot} />
  if (phase === 'shutdown') return <Shutdown onDone={reboot} />

  const active = activeWindow(wm)
  const apps: readonly ResolvedApp[] = APPS.map((app) => ({ ...app, title: appTitle(app, data) }))
  // the reference's status bar is a copyright line, not the window's name
  const status = `© Copyright ${new Date().getFullYear()} ${data.profile.name}`
  return (
    <div ref={deskRef} className={styles.desktop} data-anchor="desktop">
      <div className={styles.shortcuts}>
        {apps.map((app) => (
          <Shortcut key={app.id} icon={app.icon} label={app.shortcut ?? app.title} onOpen={() => dispatch({ type: 'open', id: app.id })} />
        ))}
      </div>
      {apps.map((app) => {
        const w = wm.windows[app.id]
        if (!w) return null
        const App = app.component
        return (
          <Window
            key={app.id}
            title={app.title}
            status={app.status ?? status}
            icon={app.icon}
            barColor={app.barColor}
            active={active === app.id}
            zIndex={w.zIndex}
            hidden={w.minimized}
            size={app.size}
            bounds={bounds}
            onFocus={() => dispatch({ type: 'focus', id: app.id })}
            onMinimize={() => dispatch({ type: 'minimize', id: app.id })}
            onClose={() => dispatch({ type: 'close', id: app.id })}
          >
            <App data={data} />
          </Window>
        )
      })}
      <Taskbar apps={apps}windows={wm} active={active} onTab={(id) => dispatch({ type: 'taskbar', id })} onShutdown={() => setPhase('shutdown')} />
    </div>
  )
}
