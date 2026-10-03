'use client'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { useTypewriter } from './use-typewriter'
import styles from './Boot.module.css'

const LINES = [
  'Beginning shutdown sequence ...',
  'Saving session ............... failed',
  'Shutdown refused: this machine always reboots.',
  'Rebooting ...',
]

/** The reference's joke, shortened: shutting down only ever reboots. */
export function Shutdown({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion()
  const shown = useTypewriter(LINES, { charMs: 10, lineMs: 400, instant: reduce, onDone })
  return (
    <div className={styles.screen} data-anchor="shutdown">
      {shown.map((line, i) => (
        <div key={i} className={i === shown.length - 1 ? styles.cursor : undefined}>{line}</div>
      ))}
    </div>
  )
}
