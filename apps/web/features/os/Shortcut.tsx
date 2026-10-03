'use client'
import type { KeyboardEvent } from 'react'
import { Icon, type IconName } from './icons'
import styles from './Shortcut.module.css'

/** A desktop icon: a click selects (focus), a double click or Enter opens. */
export function Shortcut({ icon, label, onOpen }: { icon: IconName; label: string; onOpen: () => void }) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') onOpen()
  }
  return (
    <button type="button" className={styles.shortcut} onDoubleClick={onOpen} onKeyDown={onKeyDown}>
      <Icon name={icon} size={32} />
      <span className={styles.label}>{label}</span>
    </button>
  )
}
