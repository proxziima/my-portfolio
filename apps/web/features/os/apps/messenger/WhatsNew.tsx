'use client'
import { useId, useState } from 'react'
import type { WhatsNewItem } from '@/lib/cms/types'
import styles from './messenger.module.css'

/** The What's new panel: one item at a time, with a pager when there are several. Expects at least one item. */
export function WhatsNew({ label, items }: { label: string; items: readonly WhatsNewItem[] }) {
  const [index, setIndex] = useState(0)
  const headingId = useId()
  // the list can shrink under the pager (a CMS refresh); fall back to the first item
  const current = index < items.length ? index : 0
  const item = items[current]
  if (!item) return null
  const step = (by: number) => setIndex((current + by + items.length) % items.length)
  return (
    <section className={styles.whatsNew} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>{label}</h2>
      <div className={styles.news}>
        <p>
          {item.text}
          {item.link && (
            <>
              {' '}
              {/* a new tab: the desktop may be running inside the desk scene's monitor */}
              <a href={item.link.href} target="_blank" rel="noopener noreferrer">
                {item.link.label}
              </a>
            </>
          )}
        </p>
        {item.image && <img className={styles.thumb} src={item.image} alt="" />}
      </div>
      {items.length > 1 && (
        <div className={styles.pager}>
          <button type="button" aria-label="Previous" onClick={() => step(-1)}>‹</button>
          <span>{current + 1}/{items.length}</span>
          <button type="button" aria-label="Next" onClick={() => step(1)}>›</button>
        </div>
      )}
    </section>
  )
}
