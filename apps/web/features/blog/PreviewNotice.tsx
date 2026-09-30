import type { ReactNode } from 'react'
import styles from './PreviewNotice.module.css'

/** A quiet full-page message for preview states the editor has to act on (expired session, CMS error). */
export function PreviewNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main>
      <section className={styles.notice} role="status">
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.body}>{children}</p>
        {/* A plain link, not <Link>: prefetching it would exit preview. */}
        <a className={styles.exit} href="/api/exit-preview?path=/">
          Exit preview
        </a>
      </section>
    </main>
  )
}
