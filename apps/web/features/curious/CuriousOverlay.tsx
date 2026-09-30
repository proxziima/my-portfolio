'use client'
import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import type { PageNotes } from '@/lib/cms/types'
import { useRole } from '@/features/role/RoleProvider'
import { useCurious } from './CuriousProvider'
import { computeGuides, NOTE_METRICS, type Guide } from './guides'
import { measure } from './measure'
import { useLayoutSignal } from './use-layout-signal'
import styles from './CuriousOverlay.module.css'

/** `main` not laid out yet: look again shortly (the reference's retry). */
const RETRY_MS = 150
/** the overlay's fade-out; guides are dropped after it so the next open staggers in again */
const FADE_MS = 260

/** The notes' type metrics, from the same constants guides.ts aims the leaders with. */
const NOTE_VARS = {
  '--note-font': `${NOTE_METRICS.fontPx}px`,
  '--note-lh': String(NOTE_METRICS.lineHeight),
  '--leader-y': `${NOTE_METRICS.leader}em`,
} as CSSProperties

interface Layout { guides: Guide[]; height: number }
const EMPTY: Layout = { guides: [], height: 0 }

/** Curious mode: the page shows its working. Guides are measured from the live DOM, never hard-coded. */
export function CuriousOverlay({ pageNotes }: { pageNotes: PageNotes }) {
  const { on } = useCurious()
  const { current } = useRole()
  const [tick, request] = useLayoutSignal(on, current.slug)
  const [layout, setLayout] = useState<Layout>(EMPTY)

  // measuring must happen after the commit that moved things, before paint
  useLayoutEffect(() => {
    if (!on) return
    const m = measure()
    if (!m) {
      request(RETRY_MS)
      return
    }
    setLayout({ guides: computeGuides(m, pageNotes, current.notes), height: m.docHeight })
  }, [on, tick, request, pageNotes, current.notes])

  useEffect(() => {
    if (on) return
    const t = window.setTimeout(() => setLayout(EMPTY), FADE_MS)
    return () => window.clearTimeout(t)
  }, [on])

  return (
    <div className={styles.overlay} data-visible={on} aria-hidden="true" style={{ ...NOTE_VARS, height: layout.height }}>
      {layout.guides.map((g) => (
        <span
          key={g.key}
          className={`${styles.guide} ${styles[g.kind]}`}
          data-side={g.side}
          data-note-anchor={g.anchor}
          style={{
            left: g.left, top: g.top, width: g.width, height: g.height,
            '--guide-delay': `${g.delay}ms`, '--note-rotation': `${g.rotation ?? 0}deg`,
          } as CSSProperties}
        >
          {g.label && <span className={styles.label}>{g.label}</span>}
          {g.formula && <span className={styles.fm}>{g.formula}</span>}
        </span>
      ))}
    </div>
  )
}
