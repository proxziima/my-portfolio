'use client'
import type { ComponentType } from 'react'
import type { OsAppProps } from '../apps'
import { DosPlayer } from './dos/DosPlayer'

/** A DOS program as an OS app: its js-dos bundle in the player, on black so the letterbox matches the screen. */
export function dosApp(bundleUrl: string, displayName: string): ComponentType<OsAppProps> {
  // the window passes the portfolio data; a DOS program has no use for it
  function DosApp() {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
        <DosPlayer bundleUrl={bundleUrl} />
      </div>
    )
  }
  DosApp.displayName = displayName
  return DosApp
}
