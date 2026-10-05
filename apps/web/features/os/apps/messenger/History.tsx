'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import type { ScheduleCallRendered, TwinNotice } from '@repo/twin/contract'
import type { Line, Sender } from './parts'
import styles from './messenger.module.css'

type NoticeLine = Extract<Line, { kind: 'notice' }>

/** What the history shows: a run of lines under one sender's name, or a system notice line. */
export type Group = { kind: 'group'; from: Sender; lines: Array<Exclude<Line, NoticeLine>> } | { kind: 'notice'; line: NoticeLine }

/**
 * Consecutive lines from one sender, shown under a single name as Messenger does. The booking
 * dialog is the twin's, so it joins the contact's run; a notice stands alone between runs.
 */
export function groupBySender(lines: readonly Line[]): Group[] {
  const groups: Group[] = []
  for (const line of lines) {
    if (line.kind === 'notice') {
      groups.push({ kind: 'notice', line })
      continue
    }
    const from: Sender = line.kind === 'text' ? line.from : 'contact'
    const last = groups.at(-1)
    if (last?.kind === 'group' && last.from === from) last.lines.push(line)
    else groups.push({ kind: 'group', from, lines: [line] })
  }
  return groups
}

/** The conversation so far, kept scrolled to the newest line. A notice with no text is skipped. */
export function History({
  lines,
  nameOf,
  renderBooking,
  noticeText,
}: {
  lines: readonly Line[]
  nameOf: (from: Sender) => string
  renderBooking: (booking: ScheduleCallRendered) => ReactNode
  noticeText: (notice: TwinNotice) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])
  const shown = lines.filter((line) => line.kind !== 'notice' || noticeText(line.notice) !== '')
  return (
    <div ref={ref} className={styles.history} role="log" aria-label="Conversation history">
      <ol className={styles.groups}>
        {groupBySender(shown).map((group) =>
          group.kind === 'notice' ? (
            <li key={group.line.id} className={styles.notice}>
              {noticeText(group.line.notice)}
            </li>
          ) : (
            <li key={group.lines[0]?.id}>
              <span className={styles.sender}>{nameOf(group.from)}</span>
              <ul className={styles.lines}>
                {group.lines.map((line) =>
                  line.kind === 'text' ? (
                    <li key={line.id}>{line.text}</li>
                  ) : (
                    <li key={line.id} className={styles.bookingLine}>
                      {renderBooking(line.booking)}
                    </li>
                  ),
                )}
              </ul>
            </li>
          ),
        )}
      </ol>
    </div>
  )
}
