'use client'
import dynamic from 'next/dynamic'
import { useCallback, useRef, useState } from 'react'
import { OS_PATH } from '@/features/desk/config'
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
 * expands the box to the viewport, where the monitor shows the OS at the reference's scale. The
 * link is the accessible (and the touch) way to the OS the monitor shows.
 */
export function Figure() {
  const { current } = useRole()
  const box = useRef<HTMLDivElement>(null)
  const near = useInView(box, { rootMargin: NEAR_MARGIN, once: true })
  const full = useFullscreen(box)
  const [failed, setFailed] = useState(false)
  const fail = useCallback(() => setFailed(true), [])

  return (
    <figure className={styles.plate} data-anchor="figure">
      {!failed && (
        <div ref={box} className={styles.box} data-anchor="figure-box" data-full={full.on}>
          {near && <DeskScene onFail={fail} />}
          {full.on && (
            <button type="button" className={styles.exit} onClick={full.exit}>
              Exit full screen
            </button>
          )}
        </div>
      )}
      <figcaption className={styles.caption}>
        <span key={current.slug} className={styles.captionText}>{current.caption}</span>
        <span className={styles.actions}>
          {!failed && (
            <button type="button" className={styles.action} onClick={full.enter}>
              Full screen
            </button>
          )}
          <a className={styles.action} href={OS_PATH}>Open the desktop →</a>
        </span>
      </figcaption>
    </figure>
  )
}
