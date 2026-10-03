'use client'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { OsAppProps } from '../apps'
import { CREDITS, nextSection } from './credits-data'
import styles from './Credits.module.css'

/** Seconds a section stays before the next one; a click advances at once. */
const HOLD_S = 5

/** The host never changes while the page lives, so there is nothing to subscribe to. */
const noSubscribe = () => () => {}
const clientHost = () => window.location.host
const serverHost = () => ''

/** The reference's credits roll: one section at a time, a dot per second, click to continue. */
export function Credits({ data }: OsAppProps) {
  const sections = CREDITS(data.profile.name)
  const [index, setIndex] = useState(0)
  const [time, setTime] = useState(0)
  const host = useSyncExternalStore(noSubscribe, clientHost, serverHost)

  useEffect(() => {
    const id = window.setInterval(() => setTime((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const advance = useCallback(() => {
    setIndex((i) => nextSection(i, sections.length))
    setTime(0)
  }, [sections.length])

  useEffect(() => {
    if (time > HOLD_S) advance()
  }, [time, advance])

  const section = sections[index] ?? sections[0]!
  return (
    <div className={styles.page} onPointerDown={advance}>
      <h2>Credits</h2>
      <p>{host}, {new Date().getFullYear()}</p>
      <div className={styles.slide}>
        <div key={section.title} className={styles.section}>
          <h3 className={styles.sectionTitle}>{section.title}</h3>
          {section.rows.map(([who, what]) => (
            <div key={`${who}|${what}`} className={styles.row}>
              <p>{who}</p>
              <p>{what}</p>
            </div>
          ))}
        </div>
      </div>
      <p>Click to continue...</p>
      <div className={styles.dots} data-anchor="credits-dots" aria-hidden="true">
        {Array.from({ length: time }, (_, i) => <span key={i}>.</span>)}
      </div>
    </div>
  )
}
