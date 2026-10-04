'use client'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { OsAppProps } from '../../apps'
import { Avatar } from './Avatar'
import { History } from './History'
import { withName } from './labels'
import { PersonLine } from './PersonLine'
import { scriptedResponder, type Sender } from './responder'
import { useConversation } from './use-conversation'
import styles from './messenger.module.css'

/** The Conversation window with the owner: pictures on the left, the chat on the right. */
export function Conversation({ data }: OsAppProps) {
  const { viewer, contact, labels } = data.messenger
  const respond = useMemo(() => scriptedResponder(contact.replies), [contact.replies])
  const { messages, typing, send } = useConversation(respond)
  const [draft, setDraft] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)

  // Send disables itself once the draft empties, so focus goes back to the message box
  const submit = () => {
    void send(draft)
    setDraft('')
    box.current?.focus()
  }
  // Enter sends, Shift+Enter starts a new line, as in Messenger
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    submit()
  }
  const nameOf = (from: Sender) => (from === 'viewer' ? viewer : contact).name

  return (
    <div className={styles.conversation}>
      <div className={styles.band} aria-hidden="true" />
      <div className={styles.body}>
        <div className={styles.portraits}>
          <Avatar person={contact} size="lg" />
          <Avatar person={viewer} size="lg" />
        </div>
        <div className={styles.chat}>
          <header className={styles.chatHeader}>
            <PersonLine person={contact} large />
          </header>
          <History messages={messages} nameOf={nameOf} />
          <p className={styles.typing} aria-live="polite">
            {typing ? withName(labels.typing, contact.name) : ''}
          </p>
          <form
            className={styles.compose}
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <textarea ref={box} aria-label={`Message ${contact.name}`} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} />
            <button type="submit" disabled={!draft.trim()}>
              {labels.send}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
