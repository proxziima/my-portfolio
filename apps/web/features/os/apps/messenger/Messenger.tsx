'use client'
import { useState, type ReactNode } from 'react'
import type { OsAppProps } from '../../apps'
import { Avatar } from './Avatar'
import { ContactRow } from './ContactRow'
import { AddContact, Caret, Inbox, Layout, Magnifier, Menu, Star } from './glyphs'
import { PersonLine } from './PersonLine'
import { Services } from './Services'
import { Spotlight } from './Spotlight'
import { WhatsNew } from './WhatsNew'
import styles from './messenger.module.css'

export const matchesQuery = (name: string, query: string): boolean =>
  name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())

/** A collapsible contact group, "Favorites (1)"; native details/summary does the collapsing. */
function Group({ label, count, star = false, children }: { label: string; count: number; star?: boolean; children: ReactNode }) {
  return (
    <details open className={styles.group}>
      <summary>
        {star && <Star />}
        {label} <span className={styles.count}>({count})</span>
      </summary>
      <ul className={styles.contacts}>{children}</ul>
    </details>
  )
}

/** The main window: the visitor signed in, the owner under Favorites and Friends, What's new and the foot's services. */
export function Messenger({ data, open, apps }: OsAppProps) {
  const { viewer, contact, labels, whatsNew, spotlight } = data.messenger
  const [query, setQuery] = useState('')
  const shown = matchesQuery(contact.name, query)
  const count = shown ? 1 : 0
  const openConversation = () => open('conversation')
  return (
    <div className={styles.messenger}>
      <div className={styles.top}>
        <header className={styles.header}>
          <Avatar person={viewer} size="md" />
          <PersonLine person={viewer} large menu listening={labels.listeningTo} />
          {/* the original's mail tray; here it counts What's new */}
          <span className={styles.inbox} aria-hidden="true">
            <Inbox />
            {whatsNew.length > 0 && <span className={styles.badge}>{whatsNew.length}</span>}
          </span>
        </header>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <input type="search" placeholder={labels.search} aria-label={labels.search} value={query} onChange={(e) => setQuery(e.target.value)} />
            <Magnifier />
          </label>
          <span className={styles.tools} aria-hidden="true">
            <span className={styles.tool}>
              <AddContact />
              <Caret />
            </span>
            <Menu />
            <Layout />
          </span>
        </div>
      </div>
      <div className={styles.list}>
        <Group label={labels.favorites} count={count} star>
          {shown && <ContactRow contact={contact} variant="favorite" onOpen={openConversation} />}
        </Group>
        <Group label={labels.friends} count={count}>
          {shown && <ContactRow contact={contact} variant="friend" onOpen={openConversation} />}
        </Group>
      </div>
      {whatsNew.length > 0 && <WhatsNew label={labels.whatsNew} items={whatsNew} />}
      <footer className={styles.foot}>
        <Services apps={apps} open={open} />
        {spotlight && <Spotlight story={spotlight} />}
      </footer>
    </div>
  )
}
