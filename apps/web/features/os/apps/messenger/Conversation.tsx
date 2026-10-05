'use client'
import { useRef, useState, type KeyboardEvent } from 'react'
import type { TwinNotice } from '@repo/twin/contract'
import type { MessengerLabels, MessengerPerson } from '@/lib/cms/types'
import type { OsAppProps } from '../../apps'
import { Avatar } from './Avatar'
import { BookingDialog } from './BookingDialog'
import { BandCaret, Brush, Caret, Collapse, FontStyle, Layout, Nudge, Pen, Smiley, Webcam, Wink } from './glyphs'
import { History } from './History'
import { withName } from './labels'
import { PersonLine } from './PersonLine'
import type { Sender } from './parts'
import { useTwin } from './use-twin'
import styles from './messenger.module.css'

/** A picture in the left column, with the small hide and webcam buttons beside it (decorative). */
function Portrait({ person }: { person: MessengerPerson }) {
  return (
    <div className={styles.portrait}>
      <span className={styles.portraitTools} aria-hidden="true">
        <Collapse />
        <Webcam />
      </span>
      <Avatar person={person} size="lg" />
    </div>
  )
}

/** The CMS label that explains each refusal in character. */
const refusalLabel = { throttled: 'throttled', too_long: 'tooLong', ended: 'ended', offline: 'offline' } as const

/** The system line for a booking notice; a cancellation shows nothing (empty text is skipped). */
function noticeLine(notice: TwinNotice, labels: MessengerLabels): string {
  if (notice.kind === 'booking.cancelled') return ''
  return labels.bookingNotice.replace('{time}', notice.startTime ? new Date(notice.startTime).toLocaleString() : '')
}

/** The Conversation window with the owner: pictures on the left, the chat on the right. */
export function Conversation({ data }: OsAppProps) {
  const { viewer, contact, labels } = data.messenger
  const { lines, typing, refusal, send } = useTwin()
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
      {/* the original's menu band; its words come from the CMS, its buttons are only drawn */}
      <div className={styles.band} aria-hidden="true">
        {labels.menu.map((word) => (
          <span key={word}>{word}</span>
        ))}
        <span>»</span>
        <span className={styles.bandTools}>
          <Brush />
          <BandCaret />
          <Layout />
        </span>
      </div>
      <div className={styles.body}>
        <div className={styles.portraits}>
          <Portrait person={contact} />
          <Portrait person={viewer} />
        </div>
        <div className={styles.chat}>
          <header className={styles.chatHeader}>
            <PersonLine person={contact} large listening={labels.listeningTo} />
          </header>
          <History
            lines={lines}
            nameOf={nameOf}
            renderBooking={(booking) => <BookingDialog booking={booking} labels={labels} />}
            noticeText={(notice) => noticeLine(notice, labels)}
          />
          <p className={styles.typing} aria-live="polite">
            {typing ? withName(labels.typing, contact.name) : ''}
          </p>
          {/* always mounted, like the typing line: a live region that appears with text already in it isn't reliably announced */}
          <p className={styles.refusal} role="status">
            {refusal ? labels[refusalLabel[refusal]] : ''}
          </p>
          <form
            className={styles.compose}
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <textarea ref={box} aria-label={`Message ${contact.name}`} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} />
            <div className={styles.composeBar}>
              <span className={styles.emoticons} aria-hidden="true">
                <span className={styles.tool}>
                  <Smiley />
                  <Caret />
                </span>
                <span className={styles.tool}>
                  <Wink />
                  <Caret />
                </span>
                <Nudge />
                <span className={styles.tool}>
                  <FontStyle />
                  <Caret />
                </span>
                <span>»</span>
              </span>
              <span className={styles.composeEnd}>
                <span aria-hidden="true">
                  <Pen />
                </span>
                <button type="submit" disabled={!draft.trim()}>
                  {labels.send}
                </button>
              </span>
            </div>
          </form>
          <footer className={styles.privacy}>
            <span>{labels.privacy}</span>
          </footer>
        </div>
      </div>
    </div>
  )
}
