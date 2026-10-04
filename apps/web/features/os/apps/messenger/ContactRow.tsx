import type { MessengerPerson } from '@/lib/cms/types'
import { enterOpens } from '../../enter-opens'
import { Avatar } from './Avatar'
import { PersonLine } from './PersonLine'
import styles from './messenger.module.css'

interface Props {
  contact: MessengerPerson
  /** Favorites show a small picture; groups show a status dot and one line. */
  variant: 'favorite' | 'friend'
  onOpen: () => void
}

/** A contact in the list: a click selects, a double click or Enter opens the conversation. */
export function ContactRow({ contact, variant, onOpen }: Props) {
  const favorite = variant === 'favorite'
  return (
    <li>
      <button type="button" className={styles.row} onDoubleClick={onOpen} onKeyDown={enterOpens(onOpen)}>
        {favorite ? <Avatar person={contact} size="sm" /> : <span className={styles.dot} data-status={contact.status} aria-hidden="true" />}
        <PersonLine person={contact} inline={!favorite} />
      </button>
    </li>
  )
}
