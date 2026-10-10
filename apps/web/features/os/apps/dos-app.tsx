'use client'
import { lazy, Suspense, type ComponentType } from 'react'
import type { OsAppProps } from '../apps'
import styles from './dos/DosPlayer.module.css'

// the player loads with the first DOS window; until then the window shows the player's own loading line
const DosPlayer = lazy(() => import('./dos/DosPlayer').then((m) => ({ default: m.DosPlayer })))

/**
 * A DOS program as an OS app: its js-dos bundle in the player, on black so the letterbox matches the
 * screen. `app` is the OS app id, for the load-time analytics.
 */
export function dosApp(app: string, bundleUrl: string, displayName: string): ComponentType<OsAppProps> {
  // the window passes the portfolio data; a DOS program has no use for it
  function DosApp() {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
        <Suspense fallback={<p className={styles.message}>Loading DOS…</p>}>
          <DosPlayer app={app} bundleUrl={bundleUrl} />
        </Suspense>
      </div>
    )
  }
  DosApp.displayName = displayName
  return DosApp
}
