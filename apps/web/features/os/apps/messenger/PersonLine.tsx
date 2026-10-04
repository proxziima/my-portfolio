import type { MessengerPerson } from '@/lib/cms/types'
import { Caret } from './glyphs'
import { STATUS_LABEL } from './status'
import styles from './messenger.module.css'

interface Props {
  person: MessengerPerson
  /** One line, "Name (Status) - message", as the Friends list writes it. */
  inline?: boolean
  /** The big name of a window's header. */
  large?: boolean
  /** The signed-in person's header: the status and personal message open menus (▾). */
  menu?: boolean
  /** The "Listening to:" label: shows the person's song on a line of its own. */
  listening?: string
}

/** "Name (Status)" and the personal message: the header, the contact rows and the conversation's header. */
export function PersonLine({ person, inline = false, large = false, menu = false, listening }: Props) {
  return (
    <span className={styles.person} data-layout={inline ? 'inline' : 'stacked'} data-large={large || undefined}>
      <span className={styles.headline}>
        <span className={styles.name}>{person.name}</span> <span className={styles.status}>({STATUS_LABEL[person.status]})</span>
        {menu && <Caret />}
      </span>
      {person.personalMessage && (
        <span className={styles.message}>
          <span className={styles.clip}>{person.personalMessage}</span>
          {menu && <Caret />}
        </span>
      )}
      {listening && person.listeningTo && (
        <span className={styles.listening}>
          <span aria-hidden="true">♫ </span>
          <span className={styles.clip}>
            {listening} {person.listeningTo}
          </span>
        </span>
      )}
    </span>
  )
}
