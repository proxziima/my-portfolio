import styles from './PreviewBanner.module.css'

/** Shown on every draft preview. A plain link, not <Link>: prefetching it would exit preview. */
export function PreviewBanner() {
  return (
    <aside className={styles.banner} role="status">
      <span>Preview: you&rsquo;re viewing a draft</span>
      <a className={styles.exit} href="/api/exit-preview?path=/">
        Exit preview
      </a>
    </aside>
  )
}
