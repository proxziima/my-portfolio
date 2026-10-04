import type { MessengerPerson } from '@/lib/cms/types'
import { STATUS_LABEL } from './status'
import styles from './messenger.module.css'

interface Props {
  person: MessengerPerson
  /** One line, "Name (Status) - message", as the Friends list writes it. */
  inline?: boolean
  /** The big name of a window's header. */
  large?: boolean
}

/** "Name (Status)" and the personal message: the header, the contact rows and the conversation's header. */
export function PersonLine({ person, inline = false, large = false }: Props) {
  return (
    <span className={styles.person} data-layout={inline ? 'inline' : 'stacked'} data-large={large || undefined}>
      <span className={styles.headline}>
        <span className={styles.name}>{person.name}</span> <span className={styles.status}>({STATUS_LABEL[person.status]})</span>
      </span>
      {person.personalMessage && <span className={styles.message}>{person.personalMessage}</span>}
    </span>
  )
}
