'use client'
import { useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from 'react'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { useRole } from './RoleProvider'
import styles from './RoleDrum.module.css'

const FACE_HEIGHT = 36

interface Props {
  expanded: boolean
  ref?: Ref<HTMLButtonElement>
}

/**
 * An N-sided CSS 3D prism: face i sits at +i·θ and the prism turns to −position·θ,
 * so stepping forward rolls the current face down and the next one in from above
 * (the reference's direction).
 */
export function RoleDrum({ expanded, ref }: Props) {
  const { disciplines, current, index, position, animate } = useRole()
  const reduce = useReducedMotion()
  const count = disciplines.length
  const angle = 360 / count
  const radius = count > 2 ? FACE_HEIGHT / 2 / Math.tan(Math.PI / count) : FACE_HEIGHT / 2
  const faces = useRef<(HTMLSpanElement | null)[]>([])
  const [width, setWidth] = useState<number>()

  // The button follows the current face's text width, re-measured when it
  // changes size (the webfont swapping in after the first measure).
  useLayoutEffect(() => {
    const face = faces.current[index]
    if (!face) return
    const measure = () => setWidth(face.scrollWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(face)
    return () => observer.disconnect()
  }, [index, disciplines])

  const style = {
    '--drum-angle': `${-position * angle}deg`,
    '--drum-radius': `${radius}px`,
    width: width ? `${width + 2}px` : undefined,
  } as CSSProperties

  return (
    <button
      ref={ref}
      type="button"
      className={styles.drum}
      data-animate={animate && !reduce}
      aria-haspopup="listbox"
      aria-expanded={expanded}
      aria-label={`${current.title}. Open the role list.`}
      style={style}
    >
      {/* in-flow copy of the current title: sizes the button before hydration */}
      <span className={styles.sizer} aria-hidden="true">
        {current.title}
      </span>
      <span className={styles.prism} aria-hidden="true">
        {disciplines.map((d, i) => (
          <span
            key={d.slug}
            ref={(el) => {
              faces.current[i] = el
            }}
            className={styles.face}
            style={{ '--face-angle': `${i * angle}deg` } as CSSProperties}
          >
            {d.title}
          </span>
        ))}
      </span>
    </button>
  )
}
