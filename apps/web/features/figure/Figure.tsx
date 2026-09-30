'use client'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRole } from '@/features/role/RoleProvider'
import styles from './Figure.module.css'

const SplineScene = dynamic(() => import('./SplineScene').then((m) => m.SplineScene), { ssr: false })

/** Mount the scene this far before it scrolls into view. */
const NEAR_MARGIN = '200px'

/**
 * The per-role caption under a lazily mounted Spline scene. The box holds the scene's height while it
 * loads (no layout shift); if the scene is missing or fails, the box goes and the caption stays.
 */
export function Figure({ sceneUrl }: { sceneUrl: string }) {
  const { current } = useRole()
  const box = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [failed, setFailed] = useState(false)
  const fail = useCallback(() => setFailed(true), [])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: NEAR_MARGIN },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <figure className={styles.plate} data-anchor="figure">
      {!failed && (
        <div ref={box} className={styles.box} data-anchor="figure-box">
          {near && <SplineScene url={sceneUrl} onFail={fail} />}
        </div>
      )}
      <figcaption key={current.slug} className={styles.caption}>{current.caption}</figcaption>
    </figure>
  )
}
