import type { Spotlight as SpotlightData } from '@/lib/cms/types'
import styles from './messenger.module.css'

/** A link in a new tab: the desktop may be running inside the desk scene's monitor. */
function Out({ href, className, children }: { href: string | undefined; className: string | undefined; children: string }) {
  if (!href) return <span className={className}>{children}</span>
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

/** The featured story at the foot of the main window: a picture, a headline, a line and its source. */
export function Spotlight({ story }: { story: SpotlightData }) {
  return (
    <article className={styles.spotlight}>
      {story.image && <img className={styles.spotlightImage} src={story.image} alt="" />}
      <div className={styles.spotlightText}>
        <Out href={story.href} className={styles.spotlightTitle}>{story.title}</Out>
        {story.text && <p>{story.text}</p>}
        {story.source && <Out href={story.href} className={styles.spotlightSource}>{story.source}</Out>}
      </div>
    </article>
  )
}
