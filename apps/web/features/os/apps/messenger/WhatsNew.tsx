'use client'
import { useState } from 'react'
import type { WhatsNewItem } from '@/lib/cms/types'
import styles from './messenger.module.css'

/** The What's new panel: one item at a time, with a pager when there are several. Expects at least one item. */
export function WhatsNew({ label, items }: { label: string; items: readonly WhatsNewItem[] }) {
  const [index, setIndex] = useState(0)
  const item = items[index] ?? items[0]
  if (!item) return null
  const step = (by: number) => setIndex((i) => (i + by + items.length) % items.length)
  return (
    <section className={styles.whatsNew} aria-label={label}>
      <h2 className={styles.heading}>{label}</h2>
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
          <span>{index + 1}/{items.length}</span>
          <button type="button" aria-label="Next" onClick={() => step(1)}>›</button>
        </div>
      )}
    </section>
  )
}
