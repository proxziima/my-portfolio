import type { MessengerPerson } from '@/lib/cms/types'
import { openGestures } from '../../open-gestures'
import { Avatar } from './Avatar'
import { PersonLine } from './PersonLine'
import styles from './messenger.module.css'

interface Props {
  contact: MessengerPerson
  /** Favorites show a small picture; groups show a status dot and one line. */
  variant: 'favorite' | 'friend'
  onOpen: () => void
}

/** A contact in the list: a click selects; a double click, Enter, Space or a screen reader's click opens the conversation. */
export function ContactRow({ contact, variant, onOpen }: Props) {
  const favorite = variant === 'favorite'
  return (
    <li>
      <button type="button" className={styles.row} data-variant={variant} {...openGestures(onOpen)}>
        {favorite ? <Avatar person={contact} size="sm" /> : <span className={styles.dot} data-status={contact.status} aria-hidden="true" />}
        <PersonLine person={contact} inline={!favorite} />
      </button>
    </li>
  )
}
