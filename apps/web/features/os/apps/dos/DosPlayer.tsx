'use client'
import { useEffect, useRef, useState } from 'react'
import { loadJsDos } from './load-js-dos'
import styles from './DosPlayer.module.css'

type Phase = 'loading' | 'running' | 'error'

/**
 * The reference's js-dos player: `Dos(root)` on mount, its side bar (the `flex-grow-0` column) removed,
 * the bundle run, the emulator stopped on unmount. It fills its parent, so the window's CSS sizes it.
 */
export function DosPlayer({ bundleUrl }: { bundleUrl: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('loading')

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let instance: JsDosPlayer | undefined
    let cancelled = false
    loadJsDos()
      .then(() => {
        if (cancelled || !window.Dos) return
        instance = window.Dos(root)
        for (const el of [...root.getElementsByClassName('flex-grow-0')]) el.remove()
        setPhase('running')
        return instance.run(bundleUrl)
      })
      .catch(() => {
        if (!cancelled) setPhase('error')
      })
    return () => {
      cancelled = true
      void instance?.stop()
    }
  }, [bundleUrl])

  return (
    <>
      <div ref={rootRef} className={styles.player} data-anchor="dos-player" />
      {phase === 'loading' && <p className={styles.message}>Loading DOS…</p>}
      {phase === 'error' && <p className={styles.message} role="alert">DOS could not start. Try reopening the window.</p>}
    </>
  )
}
