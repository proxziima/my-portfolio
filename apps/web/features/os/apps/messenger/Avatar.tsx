import type { MessengerPerson } from '@/lib/cms/types'
import styles from './messenger.module.css'

/** Messenger's default picture, for people without an uploaded avatar. */
function Silhouette() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" fill="#eef4fb" />
      <circle cx="24" cy="18" r="9" fill="#9fb6cf" />
      <path d="M8 48c0-10 7-17 16-17s16 7 16 17z" fill="#9fb6cf" />
    </svg>
  )
}

/** A display picture in a frame coloured by the person's status. Decorative: the name is always beside it. */
export function Avatar({ person, size }: { person: MessengerPerson; size: 'lg' | 'md' | 'sm' }) {
  return (
    <span className={styles.avatar} data-size={size} data-status={person.status}>
      {person.avatar ? <img src={person.avatar} alt="" /> : <Silhouette />}
    </span>
  )
}
