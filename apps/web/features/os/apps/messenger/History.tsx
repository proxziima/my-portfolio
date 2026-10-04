'use client'
import { useEffect, useRef } from 'react'
import type { Message, Sender } from './responder'
import styles from './messenger.module.css'

interface Group {
  from: Sender
  messages: Message[]
}

/** Consecutive messages from one sender, shown under a single name as Messenger does. */
export function groupBySender(messages: readonly Message[]): Group[] {
  const groups: Group[] = []
  for (const message of messages) {
    const last = groups.at(-1)
    if (last?.from === message.from) last.messages.push(message)
    else groups.push({ from: message.from, messages: [message] })
  }
  return groups
}

/** The conversation so far, kept scrolled to the newest message. */
export function History({ messages, nameOf }: { messages: readonly Message[]; nameOf: (from: Sender) => string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])
  return (
    <div ref={ref} className={styles.history} role="log" aria-label="Conversation history">
      <ol className={styles.groups}>
        {groupBySender(messages).map((group) => (
          <li key={group.messages[0]?.id}>
            <span className={styles.sender}>{nameOf(group.from)}</span>
            <ul className={styles.lines}>
              {group.messages.map((message) => (
                <li key={message.id}>{message.text}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}
