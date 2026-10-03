'use client'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { OS_PATH } from '@/features/desk/config'
import { useMuted } from '@/features/desk/use-muted'
import { useFullscreen } from '@/lib/dom/use-fullscreen'
import { useInView } from '@/lib/dom/use-in-view'
import { useRole } from '@/features/role/RoleProvider'
import styles from './Figure.module.css'

// three and the engine load only when the box comes near
const DeskScene = dynamic(() => import('@/features/desk/DeskScene').then((m) => m.DeskScene), { ssr: false })

/** Mount the scene this far before it scrolls into view. */
const NEAR_MARGIN = '200px'

/**
 * The desk scene with the per-role caption under it. The box holds the scene's height while it
 * loads (no layout shift); if the scene fails, the box goes and the caption stays. Full screen
 * expands the box to the viewport, where the monitor shows the OS at the reference's scale. Mute
 * silences the scene's sounds (in the caption, and in the full-screen bar where the caption is
 * hidden). The link is the accessible (and the touch) way to the OS the monitor shows.
 */
export function Figure() {
  const { current } = useRole()
  const box = useRef<HTMLDivElement>(null)
  const near = useInView(box, { rootMargin: NEAR_MARGIN, once: true })
  const full = useFullscreen(box)
  const [failed, setFailed] = useState(false)
  const fail = useCallback(() => setFailed(true), [])
  const [muted, toggleMuted] = useMuted()

  // leaving full screen hands focus back to the button that entered it (the Exit button unmounts)
  const trigger = useRef<HTMLButtonElement>(null)
  const wasOn = useRef(false)
  useEffect(() => {
    const leaving = wasOn.current && !full.on
    wasOn.current = full.on
    if (!leaving) return
    const focus = () => trigger.current?.focus({ preventScroll: true })
    // native full screen leaves the rest of the page inert until the browser has actually left it
    if (!document.fullscreenElement) return void focus()
    document.addEventListener('fullscreenchange', focus, { once: true })
    return () => document.removeEventListener('fullscreenchange', focus)
  }, [full.on])

  return (
    <figure className={styles.plate} data-anchor="figure">
      {!failed && (
        <div ref={box} className={styles.box} data-anchor="figure-box" data-full={full.on}>
          {near && <DeskScene onFail={fail} muted={muted} />}
          {full.on && (
            <span className={styles.bar}>
              <button type="button" className={styles.barButton} aria-pressed={muted} onClick={toggleMuted}>
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button type="button" className={styles.barButton} onClick={full.exit} autoFocus>
                Exit full screen
              </button>
            </span>
          )}
        </div>
      )}
      <figcaption className={styles.caption}>
        <span key={current.slug} className={styles.captionText}>{current.caption}</span>
        <span className={styles.actions}>
          {!failed && (
            <button type="button" className={styles.action} aria-pressed={muted} onClick={toggleMuted}>
              {muted ? 'Unmute' : 'Mute'}
            </button>
          )}
          {!failed && (
            <button ref={trigger} type="button" className={styles.action} onClick={full.enter}>
              Full screen
            </button>
          )}
          <a className={styles.action} href={OS_PATH}>Open the desktop →</a>
        </span>
      </figcaption>
    </figure>
  )
}
