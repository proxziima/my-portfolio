'use client'
import { DosPlayer } from './doom/DosPlayer'

/** The reference's Doom: the shareware bundle in js-dos, on black so the letterbox matches the game. */
export function Doom() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
      <DosPlayer bundleUrl="/doom.jsdos" />
    </div>
  )
}
