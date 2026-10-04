'use client'
import { useState, type ReactNode } from 'react'
import type { OsAppProps } from '../../apps'
import { Avatar } from './Avatar'
import { ContactRow } from './ContactRow'
import { PersonLine } from './PersonLine'
import { WhatsNew } from './WhatsNew'
import styles from './messenger.module.css'

export const matchesQuery = (name: string, query: string): boolean =>
  name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())

/** A collapsible contact group, "Favorites (1)"; native details/summary does the collapsing. */
function Group({ label, count, star = false, children }: { label: string; count: number; star?: boolean; children: ReactNode }) {
  return (
    <details open className={styles.group}>
      <summary>
        {star && <span className={styles.star} aria-hidden="true">★</span>}
        {label} <span className={styles.count}>({count})</span>
      </summary>
      <ul className={styles.contacts}>{children}</ul>
    </details>
  )
}

/** The main window: the visitor signed in, the owner under Favorites and Friends, and What's new. */
export function Messenger({ data, open }: OsAppProps) {
  const { viewer, contact, labels, whatsNew } = data.messenger
  const [query, setQuery] = useState('')
  const shown = matchesQuery(contact.name, query)
  const openConversation = () => open('conversation')
  return (
    <div className={styles.messenger}>
      <header className={styles.header}>
        <Avatar person={viewer} size="md" />
        <PersonLine person={viewer} large />
      </header>
      <input
        type="search"
        className={styles.search}
        placeholder={labels.search}
        aria-label={labels.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className={styles.list}>
        <Group label={labels.favorites} count={shown ? 1 : 0} star>
          {shown && <ContactRow contact={contact} variant="favorite" onOpen={openConversation} />}
        </Group>
        <Group label={labels.friends} count={shown ? 1 : 0}>
          {shown && <ContactRow contact={contact} variant="friend" onOpen={openConversation} />}
        </Group>
      </div>
      {whatsNew.length > 0 && <WhatsNew label={labels.whatsNew} items={whatsNew} />}
    </div>
  )
}
