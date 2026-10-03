'use client'
import { useEffect, useMemo } from 'react'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { useTypewriter } from './use-typewriter'
import styles from './Boot.module.css'

/** A short BIOS-style screen; a click or any key skips it. */
export function Boot({ name, onDone }: { name: string; onDone: () => void }) {
  const reduce = useReducedMotion()
  const lines = useMemo(() => [`${name} BIOS v1.0`, 'Checking memory ......... OK', 'Loading desktop ...'], [name])
  const shown = useTypewriter(lines, { charMs: 12, lineMs: 180, instant: reduce, onDone })

  useEffect(() => {
    window.addEventListener('keydown', onDone)
    return () => window.removeEventListener('keydown', onDone)
  }, [onDone])

  return (
    <div className={styles.screen} data-anchor="boot" onClick={onDone}>
      {shown.map((line, i) => (
        <div key={i} className={i === shown.length - 1 ? styles.cursor : undefined}>{line}</div>
      ))}
    </div>
  )
}
