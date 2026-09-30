'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useCurious } from '@/features/curious/CuriousProvider'
import { useRole } from '@/features/role/RoleProvider'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { CURIOUS_TRIGGER_CLASS } from '@/shared/ui/chip-markup'
import { renderParagraphs } from './morph/render'
import { useWordMorph } from './use-word-morph'
import styles from './Bio.module.css'

export function Bio() {
  const { current, animate } = useRole()
  const { on, toggle } = useCurious()
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  // server-rendered once; after that the morph owns the DOM
  const [initialHtml] = useState(() => renderParagraphs(current.bio))

  const syncToggle = useCallback(() => {
    ref.current
      ?.querySelectorAll(`.${CURIOUS_TRIGGER_CLASS}`)
      .forEach((b) => b.setAttribute('aria-checked', String(on)))
  }, [on])
  useEffect(syncToggle, [syncToggle])
  useWordMorph(ref, current.bio, { animate, reduce, onRender: syncToggle })

  // the toggle lives inside CMS-authored markup that is replaced on every morph: delegate
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest(`.${CURIOUS_TRIGGER_CLASS}`)) {
        e.preventDefault()
        toggle()
      }
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [toggle])

  return (
    <div
      ref={ref}
      className={styles.bio}
      data-anchor="bio"
      dangerouslySetInnerHTML={{ __html: initialHtml }}
      suppressHydrationWarning
    />
  )
}
